"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileSignature,
  ImagePlus,
  Loader2,
  MousePointer2,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { UploadZone } from "@/components/upload-zone"
import { baseName } from "@/lib/format"
import { downloadBlob } from "@/lib/download"
import { drawToCanvas, loadImage } from "@/lib/image-compress"
import { closePdf, friendlyPdfError, openPdf } from "@/lib/pdfjs"

/** All signature coordinates are in pixels of the rendered page (pdf.js viewport at this scale). */
const RENDER_SCALE = 1.35
const MIN_SIGNATURE_WIDTH = 48
const MAX_SIGNATURE_PIXELS = 1000 // signature images are downscaled to this width so the PDF stays small

interface SignatureImage {
  dataUrl: string
  /** height / width of the (tightly cropped) image */
  aspect: number
}

interface Signature extends SignatureImage {
  id: number
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

/* ------------------------------------------------------------------ signature image helpers */

/** Crops a canvas to its drawn content and returns it as a PNG. */
function canvasToSignature(source: HTMLCanvasElement): SignatureImage | null {
  const ctx = source.getContext("2d")
  if (!ctx || source.width === 0 || source.height === 0) return null
  const { data } = ctx.getImageData(0, 0, source.width, source.height)
  let left = source.width
  let top = source.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] > 8) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return null // nothing drawn

  const pad = 8
  const x = Math.max(0, left - pad)
  const y = Math.max(0, top - pad)
  const width = Math.min(source.width - x, right - left + 1 + pad * 2)
  const height = Math.min(source.height - y, bottom - top + 1 + pad * 2)
  const cropped = document.createElement("canvas")
  cropped.width = width
  cropped.height = height
  cropped.getContext("2d")?.drawImage(source, x, y, width, height, 0, 0, width, height)
  return { dataUrl: cropped.toDataURL("image/png"), aspect: height / width }
}

/** Turns a signature photo/scan with a (near-)white background into a transparent PNG. */
function removeLightBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data

  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < px.length; i += 4) {
    histogram[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++
  }
  // Paper brightness = the 90th percentile (works for white paper and slightly grey photos alike).
  let seen = 0
  let paper = 255
  const target = (px.length / 4) * 0.9
  for (let l = 0; l < 256; l++) {
    seen += histogram[l]
    if (seen >= target) {
      paper = l
      break
    }
  }
  const high = Math.max(80, paper - 20)
  const low = Math.max(30, paper - 100)

  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    const alpha = l >= high ? 0 : l <= low ? 255 : (255 * (high - l)) / (high - low)
    px[i + 3] = Math.min(px[i + 3], Math.round(alpha))
  }
  ctx.putImageData(image, 0, 0)
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")
  if (!ctx) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}

/** Any uploaded image (PNG/JPG/WebP…) -> trimmed PNG signature, with a transparent background. */
async function signatureFromFile(file: File): Promise<SignatureImage> {
  const loaded = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_SIGNATURE_PIXELS / loaded.width)
    const canvas = drawToCanvas(loaded.img, loaded.width * scale, loaded.height * scale, "rgba(0,0,0,0)")
    if (!hasTransparency(canvas)) removeLightBackground(canvas)
    const signature = canvasToSignature(canvas)
    if (!signature) throw new Error("No signature found in this image. Use dark ink on a light background.")
    return signature
  } finally {
    loaded.release()
  }
}

/* ------------------------------------------------------------------ component */

export function PdfSigner() {
  const [file, setFile] = useState<File | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [history, setHistory] = useState<Signature[][]>([])
  const [signatureImage, setSignatureImage] = useState<SignatureImage | null>(null)
  const [color, setColor] = useState<"black" | "blue">("black")
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  // `snapshot` = the signatures as they were before the gesture started, so Undo restores that state.
  const [drag, setDrag] = useState<{ id: number; offsetX: number; offsetY: number; snapshot: Signature[] } | null>(null)
  const [resizing, setResizing] = useState<{ id: number; startX: number; width: number; snapshot: Signature[] } | null>(null)

  const pdfCanvas = useRef<HTMLCanvasElement>(null)
  const drawCanvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const lastPoint = useRef<Point | null>(null)
  const lastRender = useRef<Promise<void>>(Promise.resolve())
  const nextId = useRef(1)

  // Free pdf.js memory when the document changes or the page is left.
  useEffect(() => {
    return () => {
      if (pdf) closePdf(pdf)
    }
  }, [pdf])

  // Render the current page. Previous renders are cancelled *and awaited* so two renders never share the canvas.
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    let task: RenderTask | null = null
    const previous = lastRender.current

    const run = (async () => {
      await previous
      if (cancelled) return
      const pdfPage = await pdf.getPage(page)
      if (cancelled) return
      const canvas = pdfCanvas.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const viewport = pdfPage.getViewport({ scale: RENDER_SCALE })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      setPageSize({ width: viewport.width, height: viewport.height })
      task = pdfPage.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" })
      await task.promise
    })().catch((e: unknown) => {
      if ((e as { name?: string })?.name !== "RenderingCancelledException") {
        setError(friendlyPdfError(e))
      }
    })

    lastRender.current = run
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, page])

  const selectPdf = useCallback(async (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf" && !/\.pdf$/i.test(selectedFile.name)) {
      setError("Please select a valid PDF file.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const document = await openPdf(await selectedFile.arrayBuffer())
      setFile(selectedFile)
      setPdf(document)
      setPage(1)
      setSignatures([])
      setHistory([])
      setSelected(null)
    } catch (e) {
      setError(friendlyPdfError(e))
    } finally {
      setBusy(false)
    }
  }, [])

  /* ---------------------------------------------------------------- signature drawing */

  const getDrawingPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = drawCanvas.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvas.current
    const point = getDrawingPoint(event)
    if (!canvas || !point) return
    canvas.setPointerCapture(event.pointerId)
    setDrawing(true)
    lastPoint.current = point
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvas.current
    const from = lastPoint.current
    if (!drawing || !from || !canvas) return
    const point = getDrawingPoint(event)
    const ctx = canvas.getContext("2d")
    if (!point || !ctx) return
    ctx.strokeStyle = color === "blue" ? "#1a5bb4" : "#111827"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPoint.current = point
  }

  // The signature is saved (and trimmed) automatically after every stroke - no separate "Save" step.
  const finishDrawing = () => {
    if (!drawing) return
    setDrawing(false)
    lastPoint.current = null
    if (drawCanvas.current) setSignatureImage(canvasToSignature(drawCanvas.current))
  }

  const clearDrawing = () => {
    const canvas = drawCanvas.current
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureImage(null)
  }

  const uploadSignature = async (selectedFile: File) => {
    if (!selectedFile.type.startsWith("image/")) {
      setError("Use a PNG, JPG or WebP picture of your signature.")
      return
    }
    setError(null)
    try {
      setSignatureImage(await signatureFromFile(selectedFile))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this signature image.")
    }
  }

  /* ---------------------------------------------------------------- placing / editing */

  const pushHistory = (next: Signature[]) => {
    setHistory((current) => [...current.slice(-19), signatures])
    setSignatures(next)
  }

  const placeSignature = () => {
    if (!signatureImage || !pageSize.width) return
    let width = Math.min(180, pageSize.width * 0.35)
    let height = width * signatureImage.aspect
    const maxHeight = pageSize.height * 0.5
    if (height > maxHeight) {
      height = maxHeight
      width = height / signatureImage.aspect
    }
    const id = nextId.current++
    pushHistory([
      ...signatures,
      {
        ...signatureImage,
        id,
        page,
        x: (pageSize.width - width) / 2,
        y: (pageSize.height - height) / 2,
        width,
        height,
      },
    ])
    setSelected(id)
  }

  /** Pointer position in page-pixel coordinates. */
  const toPagePoint = (event: React.PointerEvent): Point | null => {
    const rect = stage.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height || !pageSize.width) return null
    return {
      x: ((event.clientX - rect.left) * pageSize.width) / rect.width,
      y: ((event.clientY - rect.top) * pageSize.height) / rect.height,
    }
  }

  const onStageMove = (event: React.PointerEvent) => {
    const point = toPagePoint(event)
    if (!point) return
    if (drag) {
      setSignatures((current) =>
        current.map((s) =>
          s.id === drag.id
            ? {
                ...s,
                x: Math.max(0, Math.min(pageSize.width - s.width, point.x - drag.offsetX)),
                y: Math.max(0, Math.min(pageSize.height - s.height, point.y - drag.offsetY)),
              }
            : s,
        ),
      )
    }
    if (resizing) {
      setSignatures((current) =>
        current.map((s) => {
          if (s.id !== resizing.id) return s
          // The box keeps the signature's own aspect ratio, so what you see is exactly what gets exported.
          const maxWidth = Math.min(pageSize.width - s.x, (pageSize.height - s.y) / s.aspect)
          const width = Math.max(Math.min(MIN_SIGNATURE_WIDTH, maxWidth), Math.min(maxWidth, resizing.width + point.x - resizing.startX))
          return { ...s, width, height: width * s.aspect }
        }),
      )
    }
  }

  const finishEdit = () => {
    const gesture = drag ?? resizing
    if (gesture) {
      const changed =
        signatures.length !== gesture.snapshot.length ||
        signatures.some((s, i) => {
          const before = gesture.snapshot[i]
          return !before || before.x !== s.x || before.y !== s.y || before.width !== s.width
        })
      // Remember the state from BEFORE the move, and only if something actually moved.
      if (changed) setHistory((current) => [...current.slice(-19), gesture.snapshot])
    }
    setDrag(null)
    setResizing(null)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((current) => current.slice(0, -1))
    setSignatures(previous)
    setSelected(null)
  }

  const deleteSelected = () => {
    if (selected == null) return
    pushHistory(signatures.filter((s) => s.id !== selected))
    setSelected(null)
  }

  /* ---------------------------------------------------------------- export */

  const download = async () => {
    if (!file || !pdf || !signatures.length) {
      setError("Place at least one signature before downloading.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { PDFDocument, degrees } = await import("pdf-lib")
      const output = await PDFDocument.load(await file.arrayBuffer())
      const embedded = new Map<string, Awaited<ReturnType<typeof output.embedPng>>>()

      for (const signature of signatures) {
        const target = output.getPage(signature.page - 1)
        // Let pdf.js convert the on-screen rectangle into PDF space. This handles /Rotate, crop boxes and
        // boxes that don't start at (0,0), which a plain width/height ratio gets wrong.
        const viewport = (await pdf.getPage(signature.page)).getViewport({ scale: RENDER_SCALE })
        const [tlX, tlY] = viewport.convertToPdfPoint(signature.x, signature.y) as number[]
        const [trX, trY] = viewport.convertToPdfPoint(signature.x + signature.width, signature.y) as number[]
        const [blX, blY] = viewport.convertToPdfPoint(signature.x, signature.y + signature.height) as number[]

        let image = embedded.get(signature.dataUrl)
        if (!image) {
          image = await output.embedPng(signature.dataUrl)
          embedded.set(signature.dataUrl, image)
        }
        target.drawImage(image, {
          x: blX,
          y: blY,
          width: Math.hypot(trX - tlX, trY - tlY),
          height: Math.hypot(tlX - blX, tlY - blY),
          rotate: degrees((Math.atan2(trY - tlY, trX - tlX) * 180) / Math.PI),
        })
      }

      const bytes = await output.save()
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${baseName(file.name, "document")}_signed.pdf`)
    } catch (e) {
      setError(friendlyPdfError(e))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------------------------------------- render */

  if (!file || !pdf) {
    return (
      <div className="flex flex-col gap-4">
        <UploadZone accept="application/pdf,.pdf" label="Upload PDF to sign" icon="pdf" onFileSelect={selectPdf} />
        {busy && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing your PDF...
          </p>
        )}
        {error && <Message text={error} />}
      </div>
    )
  }

  const pageSignatures = signatures.filter((s) => s.page === page)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <FileSignature className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {pdf.numPages} {pdf.numPages === 1 ? "page" : "pages"} · processed privately on your device
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFile(null)
            setPdf(null)
            setError(null)
          }}
        >
          <X className="mr-1.5 size-4" />
          Change PDF
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-xl border border-border bg-muted/30 p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm font-semibold">
              Page {page} of {pdf.numPages}
            </span>
            <Button variant="outline" size="sm" disabled={page === pdf.numPages} onClick={() => setPage((n) => n + 1)}>
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="overflow-auto rounded-lg bg-slate-200/70 p-3">
            <div
              ref={stage}
              onPointerMove={onStageMove}
              onPointerUp={finishEdit}
              onPointerCancel={finishEdit}
              style={{
                aspectRatio: pageSize.width && pageSize.height ? `${pageSize.width} / ${pageSize.height}` : undefined,
              }}
              className="relative mx-auto w-full max-w-[900px] shadow-lg"
            >
              <canvas ref={pdfCanvas} className="absolute inset-0 block h-full w-full bg-white" aria-label={`PDF page ${page}`} />

              {pageSignatures.map((signature) => (
                <div
                  key={signature.id}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    const point = toPagePoint(event)
                    if (!point) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setSelected(signature.id)
                    setDrag({
                      id: signature.id,
                      offsetX: point.x - signature.x,
                      offsetY: point.y - signature.y,
                      snapshot: signatures,
                    })
                  }}
                  className={`absolute cursor-move touch-none outline-2 ${
                    selected === signature.id ? "bg-primary/5 outline outline-primary" : "hover:outline hover:outline-primary/60"
                  }`}
                  style={{
                    left: `${(signature.x / pageSize.width) * 100}%`,
                    top: `${(signature.y / pageSize.height) * 100}%`,
                    width: `${(signature.width / pageSize.width) * 100}%`,
                    height: `${(signature.height / pageSize.height) * 100}%`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signature.dataUrl}
                    alt="Signature placed on PDF"
                    className="pointer-events-none size-full object-fill"
                    draggable={false}
                  />
                  <button
                    type="button"
                    aria-label="Resize signature"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      const point = toPagePoint(event)
                      if (!point) return
                      event.currentTarget.setPointerCapture(event.pointerId)
                      setSelected(signature.id)
                      setResizing({ id: signature.id, startX: point.x, width: signature.width, snapshot: signatures })
                    }}
                    className="absolute -bottom-2.5 -right-2.5 size-5 cursor-se-resize touch-none rounded-full border-2 border-background bg-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MousePointer2 className="size-3.5" />
              Drag signatures to place them. Use the corner dot to resize. Pinch to zoom on your phone.
            </p>
            <span className="text-xs font-medium text-primary">
              {signatures.length} signature{signatures.length === 1 ? "" : "s"} placed
            </span>
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-heading)] text-sm font-bold">Your signature</h2>
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setColor("black")}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${color === "black" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Black
                </button>
                <button
                  type="button"
                  onClick={() => setColor("blue")}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${color === "blue" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                >
                  Blue
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-2">
              <canvas
                ref={drawCanvas}
                width={440}
                height={150}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={finishDrawing}
                onPointerCancel={finishDrawing}
                className="aspect-[440/150] w-full cursor-crosshair touch-none rounded bg-card"
                aria-label="Draw your signature"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Draw with your finger or mouse - it is saved automatically.</p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={clearDrawing}>
                <Eraser className="mr-1 size-3.5" />
                Clear
              </Button>
            </div>

            <div className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadSignature(f)
                e.target.value = ""
              }}
            />
            <Button type="button" variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
              <ImagePlus className="mr-2 size-4" />
              Upload signature image
            </Button>

            {signatureImage && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureImage.dataUrl}
                  alt="Signature preview"
                  className="mt-3 h-16 w-full rounded border border-border bg-white object-contain"
                />
                <Button type="button" className="mt-2 w-full" onClick={placeSignature}>
                  <Upload className="mr-2 size-4" />
                  Place on page {page}
                </Button>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-[family-name:var(--font-heading)] text-sm font-bold">Edit placements</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={undo} disabled={!history.length}>
                <Undo2 className="mr-1.5 size-4" />
                Undo
              </Button>
              <Button variant="outline" size="sm" onClick={deleteSelected} disabled={selected == null}>
                <Trash2 className="mr-1.5 size-4" />
                Delete selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  pushHistory([])
                  setSelected(null)
                }}
                disabled={!signatures.length}
              >
                <Eraser className="mr-1.5 size-4" />
                Clear all
              </Button>
            </div>
          </div>

          <Button
            size="lg"
            onClick={download}
            disabled={busy || !signatures.length}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}{" "}
            {busy ? "Creating PDF..." : "Download signed PDF"}
          </Button>
          {error && <Message text={error} />}
        </aside>
      </div>
    </div>
  )
}

function Message({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      {text}
    </div>
  )
}
