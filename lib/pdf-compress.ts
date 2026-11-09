import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFRef,
} from "pdf-lib"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import { nextTick } from "@/lib/format"
import { canvasToJpeg, drawToCanvas, maxSafeScale, releaseCanvas } from "@/lib/image-compress"
import { closePdf, openPdf } from "@/lib/pdfjs"

/*
 * PDF compression, from gentlest to most destructive. We stop at the first step that reaches the
 * target, so text stays selectable whenever that is possible:
 *
 *   1. "optimized"        - lossless rewrite (object streams, deflate of uncompressed streams)
 *   2. "images"           - only the embedded JPEG photos/scans are re-compressed; text & vectors untouched
 *   3. "pages-as-images"  - every page is rendered to a JPEG (text is no longer selectable)
 *
 * The result is never larger than the original file.
 */

export type PdfCompressMethod = "original" | "optimized" | "images" | "pages-as-images"

export interface PdfCompressResult {
  blob: Blob
  method: PdfCompressMethod
  reachedTarget: boolean
  /** false only when pages were flattened to images AND the PDF had selectable text */
  textPreserved: boolean
}

export interface PdfCompressOptions {
  targetBytes: number
  /** when true the destructive "pages-as-images" step is never used */
  keepText: boolean
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

const PDF_TYPE = "application/pdf"

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError")
}

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: PDF_TYPE })

/* ------------------------------------------------------------------------------------------ */
/* Shared search: find the strongest setting t in [0,1] whose output still fits under target.   */
/* t = 0 is the most aggressive setting, t = 1 the gentlest.                                     */
/* ------------------------------------------------------------------------------------------ */

async function searchParam(
  evaluate: (t: number) => Promise<Blob>,
  targetBytes: number,
  iterations: number,
  signal: AbortSignal | undefined,
  onStep: (fraction: number) => void,
): Promise<{ fit: Blob | null; floor: Blob }> {
  throwIfAborted(signal)
  const floor = await evaluate(0)
  onStep(1 / (iterations + 1))
  if (floor.size > targetBytes) return { fit: null, floor }

  let best = floor
  let lo = 0
  let hi = 1
  for (let i = 0; i < iterations; i++) {
    throwIfAborted(signal)
    const mid = (lo + hi) / 2
    const blob = await evaluate(mid)
    onStep((i + 2) / (iterations + 1))
    if (blob.size <= targetBytes) {
      best = blob
      lo = mid
      if (blob.size >= targetBytes * 0.9) break // close enough to the target
    } else {
      hi = mid
    }
  }
  return { fit: best, floor }
}

/* ------------------------------------------------------------------------------------------ */
/* Step 1: lossless                                                                              */
/* ------------------------------------------------------------------------------------------ */

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function losslessPass(buffer: ArrayBuffer, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false })

    // Flate-compress streams that are stored uncompressed (some generators never compress them).
    const SKIP_TYPES = new Set(["/Metadata", "/XRef", "/ObjStm"])
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      throwIfAborted(signal)
      if (!(obj instanceof PDFRawStream)) continue
      if (obj.dict.has(PDFName.of("Filter"))) continue
      if (obj.contents.length < 512) continue
      if (SKIP_TYPES.has(String(obj.dict.get(PDFName.of("Type"))))) continue
      const packed = await deflate(obj.contents)
      if (!packed || packed.length >= obj.contents.length) continue
      const dict = obj.dict.clone(doc.context)
      dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"))
      dict.set(PDFName.of("Length"), PDFNumber.of(packed.length))
      doc.context.assign(ref, PDFRawStream.of(dict, packed))
    }

    return pdfBlob(await doc.save({ useObjectStreams: true }))
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error
    return null // unusual/encrypted file - the other steps may still work
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Step 2: re-compress embedded JPEG images only                                                 */
/* ------------------------------------------------------------------------------------------ */

function filterNames(dict: PDFDict): string[] {
  const filter = dict.lookup(PDFName.of("Filter"))
  if (!filter) return []
  if (filter instanceof PDFName) return [filter.toString()]
  if (filter instanceof PDFArray) {
    const names: string[] = []
    for (let i = 0; i < filter.size(); i++) names.push(String(filter.lookup(i)))
    return names
  }
  return []
}

interface JpegImage {
  ref: PDFRef
  stream: PDFRawStream
  width: number
  height: number
}

function findJpegImages(doc: PDFDocument): JpegImage[] {
  const found: JpegImage[] = []
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const dict = obj.dict
    if (String(dict.get(PDFName.of("Subtype"))) !== "/Image") continue
    const filters = filterNames(dict)
    if (filters.length !== 1 || filters[0] !== "/DCTDecode") continue
    const mask = dict.lookup(PDFName.of("ImageMask"))
    if (mask instanceof PDFBool && mask.asBoolean()) continue
    if (dict.has(PDFName.of("Mask"))) continue // colour-key / stencil masks depend on exact pixel values
    const width = dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() ?? 0
    const height = dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() ?? 0
    if (width * height < 40_000 || obj.contents.length < 8 * 1024) continue // too small to matter
    found.push({ ref, stream: obj, width, height })
  }
  return found
}

async function recompressImages(
  buffer: ArrayBuffer,
  t: number,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const doc = await PDFDocument.load(buffer, { updateMetadata: false })
  const images = findJpegImages(doc)
  if (images.length === 0) return null

  const scale = 0.2 + 0.8 * t // 0.2 .. 1.0 of the original pixel size
  const quality = 0.35 + 0.5 * t // 0.35 .. 0.85

  for (const image of images) {
    throwIfAborted(signal)
    try {
      const original = image.stream.contents
      const bitmap = await createImageBitmap(new Blob([original as BlobPart], { type: "image/jpeg" }))
      const s = Math.min(scale, maxSafeScale(bitmap.width, bitmap.height))
      const w = Math.max(8, Math.round(bitmap.width * s))
      const h = Math.max(8, Math.round(bitmap.height * s))
      const canvas = drawToCanvas(bitmap, w, h)
      bitmap.close()
      const jpeg = await canvasToJpeg(canvas, quality)
      releaseCanvas(canvas)
      const bytes = new Uint8Array(await jpeg.arrayBuffer())
      if (bytes.length >= original.length) continue // keep the original when we can't beat it

      const dict = doc.context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: w,
        Height: h,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "DCTDecode",
        Length: bytes.length,
      })
      const softMask = image.stream.dict.get(PDFName.of("SMask"))
      if (softMask) dict.set(PDFName.of("SMask"), softMask) // transparency keeps its own resolution
      doc.context.assign(image.ref, PDFRawStream.of(dict, bytes))
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") throw error
      // undecodable image: leave it exactly as it was
    }
    await nextTick()
  }
  return pdfBlob(await doc.save({ useObjectStreams: true }))
}

async function imagesPass(
  buffer: ArrayBuffer,
  targetBytes: number,
  signal: AbortSignal | undefined,
  onStep: (fraction: number) => void,
): Promise<{ fit: Blob | null; floor: Blob } | null> {
  const probe = findJpegImages(await PDFDocument.load(buffer, { updateMetadata: false }))
  if (probe.length === 0) return null
  const evaluate = async (t: number) => {
    const blob = await recompressImages(buffer, t, signal)
    return blob ?? new Blob([buffer], { type: PDF_TYPE })
  }
  return searchParam(evaluate, targetBytes, 7, signal, onStep)
}

/* ------------------------------------------------------------------------------------------ */
/* Step 3: render every page to a JPEG                                                           */
/* ------------------------------------------------------------------------------------------ */

async function renderPageToJpeg(page: PDFPageProxy, scale: number, quality: number): Promise<Uint8Array> {
  let viewport = page.getViewport({ scale })
  const safe = maxSafeScale(viewport.width, viewport.height)
  if (safe < 1) viewport = page.getViewport({ scale: scale * safe })

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser doesn't support canvas, which is needed to process PDFs.")
  try {
    await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise
    const blob = await canvasToJpeg(canvas, quality)
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    releaseCanvas(canvas)
    page.cleanup()
  }
}

async function documentHasText(pdf: PDFDocumentProxy): Promise<boolean> {
  const pagesToCheck = Math.min(pdf.numPages, 5)
  for (let i = 1; i <= pagesToCheck; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    page.cleanup()
    if (content.items.some((item) => "str" in item && item.str.trim().length > 0)) return true
  }
  return false
}

async function rasterPass(
  buffer: ArrayBuffer,
  targetBytes: number,
  signal: AbortSignal | undefined,
  onStep: (fraction: number) => void,
): Promise<{ fit: Blob | null; floor: Blob; hadText: boolean }> {
  const pdf = await openPdf(buffer)
  try {
    const hadText = await documentHasText(pdf)
    const sizes: { width: number; height: number }[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 }) // includes the page's own rotation
      sizes.push({ width: viewport.width, height: viewport.height })
    }

    const evaluate = async (t: number) => {
      const scale = 0.15 * Math.pow(2 / 0.15, t) // 0.15 .. 2.0 (about 11 .. 144 DPI)
      const quality = 0.3 + 0.62 * t // 0.30 .. 0.92
      const out = await PDFDocument.create()
      for (let i = 1; i <= pdf.numPages; i++) {
        throwIfAborted(signal)
        const page = await pdf.getPage(i)
        const jpegBytes = await renderPageToJpeg(page, scale, quality)
        const jpeg = await out.embedJpg(jpegBytes)
        const { width, height } = sizes[i - 1]
        out.addPage([width, height]).drawImage(jpeg, { x: 0, y: 0, width, height })
        await nextTick()
      }
      return pdfBlob(await out.save())
    }

    const result = await searchParam(evaluate, targetBytes, 8, signal, onStep)
    return { ...result, hadText }
  } finally {
    closePdf(pdf)
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Public entry point                                                                            */
/* ------------------------------------------------------------------------------------------ */

export async function compressPdf(
  buffer: ArrayBuffer,
  { targetBytes, keepText, signal, onProgress }: PdfCompressOptions,
): Promise<PdfCompressResult> {
  const report = (percent: number) => onProgress?.(Math.round(Math.min(99, Math.max(0, percent))))
  const originalBlob = new Blob([buffer], { type: PDF_TYPE })
  const original: PdfCompressResult = {
    blob: originalBlob,
    method: "original",
    reachedTarget: buffer.byteLength <= targetBytes,
    textPreserved: true,
  }
  if (original.reachedTarget) return original

  // Candidates that keep the document's text intact; if nothing reaches the target we return the smallest.
  const safeCandidates: PdfCompressResult[] = []
  const consider = (blob: Blob | null, method: PdfCompressMethod) => {
    if (blob && blob.size < buffer.byteLength) {
      safeCandidates.push({ blob, method, reachedTarget: blob.size <= targetBytes, textPreserved: true })
    }
  }

  // 1. lossless
  report(5)
  const optimized = await losslessPass(buffer, signal)
  consider(optimized, "optimized")
  if (optimized && optimized.size <= targetBytes && optimized.size < buffer.byteLength) {
    return safeCandidates[safeCandidates.length - 1]
  }

  // 2. images only
  report(15)
  let imageStepFit: Blob | null = null
  try {
    const images = await imagesPass(buffer, targetBytes, signal, (f) => report(15 + f * 35))
    if (images) {
      imageStepFit = images.fit
      consider(images.fit ?? images.floor, "images")
    }
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error
    // this step is best-effort; fall through to the next one
  }
  if (imageStepFit && imageStepFit.size < buffer.byteLength) {
    return safeCandidates[safeCandidates.length - 1]
  }

  // 3. flatten pages to images (opt-out via keepText)
  if (!keepText) {
    report(50)
    const raster = await rasterPass(buffer, targetBytes, signal, (f) => report(50 + f * 45))
    if (raster.fit && raster.fit.size < buffer.byteLength) {
      return {
        blob: raster.fit,
        method: "pages-as-images",
        reachedTarget: true,
        textPreserved: !raster.hadText,
      }
    }
  }

  // Nothing reached the target: give back the smallest text-safe result, or the untouched original.
  if (safeCandidates.length > 0) {
    return safeCandidates.reduce((best, c) => (c.blob.size < best.blob.size ? c : best))
  }
  return original
}
