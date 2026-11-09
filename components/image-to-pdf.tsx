"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  Grid3X3,
  Layers,
  Maximize2,
  Move,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { downloadBlob } from "@/lib/download"
import { nextTick } from "@/lib/format"
import { canvasToJpeg, drawToCanvas, loadImage, maxSafeScale, releaseCanvas } from "@/lib/image-compress"

const A4_W = 595 // PDF points
const A4_H = 842
const MARGIN = 20
const MAX_CANVAS_W = 560
const MIN_SIZE = 30
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i

type QualityKey = "high" | "medium" | "small"

/** dpi = pixel density of each picture *at the size it is placed on the page*; this is what controls file size. */
const QUALITY_PRESETS: Record<QualityKey, { label: string; hint: string; dpi: number; quality: number }> = {
  high: { label: "High", hint: "Best for printing", dpi: 220, quality: 0.9 },
  medium: { label: "Medium", hint: "Good for sharing", dpi: 150, quality: 0.8 },
  small: { label: "Small file", hint: "For upload limits", dpi: 100, quality: 0.65 },
}

interface PlacedImage {
  id: string
  file: File
  /** object URL used for the on-screen preview (revoked when the image is removed) */
  url: string
  naturalW: number
  naturalH: number
  /** zero-based page index */
  page: number
  x: number
  y: number
  w: number
  h: number
}

let counter = 0
function uid() {
  return "img-" + ++counter + "-" + Date.now()
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

/** Largest size with the image's aspect ratio that fits inside the box. */
function fitInside(naturalW: number, naturalH: number, boxW: number, boxH: number) {
  const ratio = naturalH > 0 ? naturalW / naturalH : 1
  let w = boxW
  let h = w / ratio
  if (h > boxH) {
    h = boxH
    w = h * ratio
  }
  return { w: Math.max(MIN_SIZE, w), h: Math.max(MIN_SIZE, h) }
}

export function ImageToPdf() {
  const [images, setImages] = useState<PlacedImage[]>([])
  const [pageCount, setPageCount] = useState(1)
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quality, setQuality] = useState<QualityKey>("medium")
  const [converting, setConverting] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [displayScale, setDisplayScale] = useState(0.6)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<PlacedImage[]>([])
  const displayScaleRef = useRef(displayScale)

  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => {
    displayScaleRef.current = displayScale
  }, [displayScale])

  // Free every preview URL when leaving the page.
  useEffect(() => {
    return () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url))
  }, [])

  // Keep the A4 preview sized to its container (also reacts to rotation / window resize).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const width = Math.min(el.clientWidth, MAX_CANVAS_W)
      if (width > 0) setDisplayScale(width / A4_W)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const displayW = A4_W * displayScale
  const displayH = A4_H * displayScale
  const pageImages = images.filter((img) => img.page === currentPage)

  /* ------------------------------------------------------------------ adding photos */

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setError(null)
      const failed: string[] = []
      const added: PlacedImage[] = []
      let onThisPage = imagesRef.current.filter((img) => img.page === currentPage).length

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.test(file.name)) {
          failed.push(file.name)
          continue
        }
        try {
          const loaded = await loadImage(file)
          const { width: naturalW, height: naturalH } = loaded
          loaded.release()

          const { w: fitW, h: fitH } = fitInside(
            Math.min(naturalW, A4_W * 0.8),
            (Math.min(naturalW, A4_W * 0.8) * naturalH) / naturalW,
            A4_W * 0.8,
            A4_H * 0.4,
          )
          // Cascade new photos a little so they never sit exactly on top of each other.
          const offset = (onThisPage % 6) * 28
          onThisPage++
          added.push({
            id: uid(),
            file,
            url: URL.createObjectURL(file),
            naturalW,
            naturalH,
            page: currentPage,
            x: clamp((A4_W - fitW) / 2, 0, A4_W - fitW),
            y: clamp(40 + offset, 0, A4_H - fitH),
            w: fitW,
            h: fitH,
          })
        } catch {
          failed.push(file.name)
        }
      }

      if (added.length > 0) {
        setImages((prev) => [...prev, ...added])
        setSelectedId(added[added.length - 1].id)
      }
      if (failed.length > 0) {
        setError(
          `Couldn't add: ${failed.join(", ")}. Only images your browser can open work (JPG, PNG, WebP…). HEIC photos must be converted first.`,
        )
      }
    },
    [currentPage],
  )

  /* ------------------------------------------------------------------ layout helpers */

  const autoGrid = useCallback(() => {
    setImages((prev) => {
      const onPage = prev.filter((img) => img.page === currentPage)
      if (onPage.length === 0) return prev
      const gap = 12
      const usableW = A4_W - MARGIN * 2
      const usableH = A4_H - MARGIN * 2
      const cols = onPage.length === 1 ? 1 : onPage.length <= 4 ? 2 : 3
      const rows = Math.ceil(onPage.length / cols)
      const cellW = (usableW - gap * (cols - 1)) / cols
      const cellH = (usableH - gap * (rows - 1)) / rows

      let index = 0
      return prev.map((img) => {
        if (img.page !== currentPage) return img
        const col = index % cols
        const row = Math.floor(index / cols)
        index++
        const { w, h } = fitInside(img.naturalW, img.naturalH, cellW, cellH)
        const x = MARGIN + col * (cellW + gap) + (cellW - w) / 2
        const y = MARGIN + row * (cellH + gap) + (cellH - h) / 2
        return { ...img, x: clamp(x, 0, A4_W - w), y: clamp(y, 0, A4_H - h), w, h }
      })
    })
  }, [currentPage])

  /** Every photo gets its own page, centred - ideal for documents and scans. */
  const onePerPage = useCallback(() => {
    setImages((prev) =>
      prev.map((img, index) => {
        const { w, h } = fitInside(img.naturalW, img.naturalH, A4_W - MARGIN * 2, A4_H - MARGIN * 2)
        return { ...img, page: index, x: (A4_W - w) / 2, y: (A4_H - h) / 2, w, h }
      }),
    )
    setPageCount(Math.max(1, imagesRef.current.length))
    setCurrentPage(0)
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    const removed = imagesRef.current.find((img) => img.id === selectedId)
    if (removed) URL.revokeObjectURL(removed.url)
    setImages((prev) => prev.filter((img) => img.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  const addPage = () => {
    setPageCount((n) => n + 1)
    setCurrentPage(pageCount)
    setSelectedId(null)
  }

  const deletePage = () => {
    if (pageCount <= 1) {
      clearAll()
      return
    }
    imagesRef.current.filter((img) => img.page === currentPage).forEach((img) => URL.revokeObjectURL(img.url))
    setImages((prev) =>
      prev.filter((img) => img.page !== currentPage).map((img) => (img.page > currentPage ? { ...img, page: img.page - 1 } : img)),
    )
    setPageCount((n) => n - 1)
    setCurrentPage((p) => Math.max(0, Math.min(p, pageCount - 2)))
    setSelectedId(null)
  }

  const clearAll = () => {
    imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url))
    setImages([])
    setPageCount(1)
    setCurrentPage(0)
    setSelectedId(null)
    setError(null)
  }

  /* ------------------------------------------------------------------ drag / resize */

  const dragRef = useRef<{
    mode: "move" | "resize"
    imgId: string
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    ratio: number
  } | null>(null)

  const onPointerDownImage = useCallback((e: React.PointerEvent, imgId: string, mode: "move" | "resize") => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(imgId)
    const img = imagesRef.current.find((i) => i.id === imgId)
    if (!img) return
    const ratio = img.h > 0 ? img.w / img.h : 1
    dragRef.current = {
      mode,
      imgId,
      startX: e.clientX,
      startY: e.clientY,
      origX: img.x,
      origY: img.y,
      origW: img.w,
      ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
    }
  }, [])

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      ev.preventDefault()
      const scale = displayScaleRef.current || 1
      const dx = (ev.clientX - d.startX) / scale
      const dy = (ev.clientY - d.startY) / scale

      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== d.imgId) return img
          if (d.mode === "move") {
            return {
              ...img,
              x: clamp(d.origX + dx, 0, A4_W - img.w),
              y: clamp(d.origY + dy, 0, A4_H - img.h),
            }
          }
          // resize: aspect ratio locked, kept inside the page
          const maxW = Math.min(A4_W - img.x, (A4_H - img.y) * d.ratio)
          const newW = clamp(d.origW + dx, Math.min(MIN_SIZE, maxW), maxW)
          return { ...img, w: newW, h: newW / d.ratio }
        }),
      )
    }
    function onEnd() {
      dragRef.current = null
    }
    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onEnd)
    window.addEventListener("pointercancel", onEnd)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onEnd)
      window.removeEventListener("pointercancel", onEnd)
    }
  }, [])

  /* ------------------------------------------------------------------ export */

  const convertToPdf = async () => {
    if (images.length === 0) return
    setConverting(true)
    setError(null)
    try {
      const { PDFDocument } = await import("pdf-lib")
      const doc = await PDFDocument.create()
      const preset = QUALITY_PRESETS[quality]
      const pageIndexes = [...new Set(images.map((img) => img.page))].sort((a, b) => a - b)
      let done = 0

      for (const pageIndex of pageIndexes) {
        const page = doc.addPage([A4_W, A4_H])
        for (const img of images.filter((i) => i.page === pageIndex)) {
          setStatusText(`Processing photo ${++done} of ${images.length}…`)
          await nextTick()

          let loaded
          try {
            loaded = await loadImage(img.file)
          } catch {
            throw new Error(`Couldn't read "${img.file.name}". Remove it and try again.`)
          }
          // Only as many pixels as the placed size needs at the chosen DPI - this is what keeps the PDF small.
          const wantedW = Math.ceil((img.w / 72) * preset.dpi)
          const scale = Math.min(1, wantedW / loaded.width, maxSafeScale(loaded.width, loaded.height))
          const canvas = drawToCanvas(loaded.img, loaded.width * scale, loaded.height * scale)
          loaded.release()
          let jpegBytes: Uint8Array
          try {
            jpegBytes = new Uint8Array(await (await canvasToJpeg(canvas, preset.quality)).arrayBuffer())
          } finally {
            releaseCanvas(canvas)
          }
          const jpeg = await doc.embedJpg(jpegBytes)
          page.drawImage(jpeg, { x: img.x, y: A4_H - img.y - img.h, width: img.w, height: img.h })
        }
      }

      const bytes = await doc.save()
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), "images-to-pdf.pdf")
    } catch (err) {
      console.error("PDF conversion error:", err)
      setError(err instanceof Error ? err.message : "Failed to convert. Please try again.")
    } finally {
      setConverting(false)
      setStatusText("")
    }
  }

  const usedPages = new Set(images.map((img) => img.page)).size

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Plus className="size-4" />
          Add Photos
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={autoGrid}
          disabled={pageImages.length === 0}
        >
          <Grid3X3 className="size-4" />
          Auto Grid
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onePerPage}
          disabled={images.length < 2}
        >
          <Layers className="size-4" />
          One per page
        </Button>
        {selectedId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={deleteSelected}
          >
            <Trash2 className="size-4" />
            Delete photo
          </Button>
        )}
        {images.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearAll}>
            <RotateCcw className="size-4" />
            Clear All
          </Button>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setCurrentPage((p) => Math.max(0, p - 1))
            setSelectedId(null)
          }}
          disabled={currentPage === 0}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-semibold">
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" className="gap-1" onClick={addPage}>
            <FilePlus2 className="size-4" />
            Add page
          </Button>
          {pageCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:bg-destructive/10"
              onClick={deletePage}
            >
              <Trash2 className="size-4" />
              Delete page
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setCurrentPage((p) => Math.min(pageCount - 1, p + 1))
            setSelectedId(null)
          }}
          disabled={currentPage >= pageCount - 1}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* A4 page */}
      <div ref={wrapperRef} className="flex justify-center px-3">
        <div
          className="relative shrink-0 border-2 border-border bg-white shadow-lg"
          style={{
            width: displayW,
            height: displayH,
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onPointerDown={() => setSelectedId(null)}
        >
          {/* margin guides */}
          <svg className="pointer-events-none absolute inset-0" width={displayW} height={displayH}>
            <rect
              x={MARGIN * displayScale}
              y={MARGIN * displayScale}
              width={(A4_W - MARGIN * 2) * displayScale}
              height={(A4_H - MARGIN * 2) * displayScale}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          </svg>

          {pageImages.length === 0 && (
            <button
              type="button"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <Plus className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground/60">Tap to add photos</p>
              <p className="text-xs text-foreground/40">Place images on this A4 page</p>
            </button>
          )}

          {pageImages.map((img) => {
            const isSelected = selectedId === img.id
            return (
              <div
                key={img.id}
                className={`absolute select-none ${
                  isSelected ? "ring-2 ring-primary ring-offset-1" : "ring-0 hover:ring-1 hover:ring-primary/30"
                }`}
                style={{
                  left: img.x * displayScale,
                  top: img.y * displayScale,
                  width: img.w * displayScale,
                  height: img.h * displayScale,
                  touchAction: "none",
                  zIndex: isSelected ? 50 : 1,
                  cursor: isSelected ? "grab" : "pointer",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onPointerDownImage(e, img.id, "move")
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`Placed photo ${img.file.name}`}
                  className="pointer-events-none size-full object-fill"
                  draggable={false}
                />

                {isSelected && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
                    <Move className="mr-0.5 inline size-3" />
                    Drag
                  </div>
                )}

                {isSelected && (
                  <div
                    className="absolute -bottom-3 -right-3 z-[60] flex size-8 cursor-se-resize items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      onPointerDownImage(e, img.id, "resize")
                    }}
                  >
                    <Maximize2 className="size-3.5" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {images.length === 0
          ? "Add photos from your gallery to arrange them on A4 pages"
          : `${images.length} photo${images.length > 1 ? "s" : ""} on ${usedPages} page${usedPages > 1 ? "s" : ""}. Tap to select, drag to move, corner to resize.`}
      </p>

      {/* PDF quality - controls the output file size */}
      <fieldset className="flex flex-col gap-2" disabled={converting}>
        <legend className="mb-1 text-sm font-semibold">PDF quality</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setQuality(key)}
              aria-pressed={quality === key}
              className={`rounded-lg px-2 py-2 text-center transition-all ${
                quality === key
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-secondary text-secondary-foreground hover:bg-primary/10"
              }`}
            >
              <span className="block text-sm font-semibold">{QUALITY_PRESETS[key].label}</span>
              <span className="block text-[11px] opacity-80">{QUALITY_PRESETS[key].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <Button
        onClick={convertToPdf}
        disabled={images.length === 0 || converting}
        className="w-full gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
        size="lg"
      >
        {converting ? (
          <>
            <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            {statusText || "Converting..."}
          </>
        ) : (
          <>
            <Download className="size-4" />
            Convert to PDF{usedPages > 1 ? ` (${usedPages} pages)` : ""}
          </>
        )}
      </Button>
    </div>
  )
}
