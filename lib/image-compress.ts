import { nextTick } from "@/lib/format"

/** Largest canvas we will create. iOS Safari refuses canvases above 16,777,216 pixels. */
export const MAX_CANVAS_PIXELS = 16_000_000

const UNSUPPORTED_IMAGE =
  "This image can't be opened by your browser (for example HEIC/HEIF from some phones). Convert it to JPG or PNG and try again."

export interface LoadedImage {
  img: HTMLImageElement
  width: number
  height: number
  /** Frees the underlying object URL. Safe to call more than once. */
  release: () => void
}

/** Decodes an image file/blob into an <img> (EXIF rotation is applied by the browser). */
export async function loadImage(file: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(UNSUPPORTED_IMAGE))
      img.src = url
    })
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    URL.revokeObjectURL(url)
    throw new Error(UNSUPPORTED_IMAGE)
  }
  let released = false
  return {
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => {
      if (!released) {
        released = true
        URL.revokeObjectURL(url)
      }
    },
  }
}

/**
 * Draws an image onto a new canvas of the given size.
 * The background is filled first (white by default) - JPEG has no transparency, so without this
 * every transparent PNG pixel would turn black.
 */
export function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  background = "#ffffff",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser doesn't support canvas, which is needed to process images.")
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The image is too large for this device's memory. Try a smaller image.")),
      "image/jpeg",
      quality,
    )
  })
}

/** Releases canvas memory right away (important on phones). */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

/** Scale factor (<= 1) that keeps width*height under the canvas limit. */
export function maxSafeScale(width: number, height: number): number {
  return Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)))
}

export interface ImageCompressResult {
  blob: Blob
  width: number
  height: number
  reachedTarget: boolean
}

const QUALITY_FLOOR = 0.45 // below this JPEG gets blocky - shrink the pixels instead
const QUALITY_CEIL = 0.95
const MIN_SIDE = 24 // never shrink below this many pixels on the short side

/**
 * Produces a JPEG as close as possible to (but not over) `targetBytes`.
 *
 * 1. Probe at the quality floor. If it's too big, shrink the pixel dimensions (size ~ pixel count)
 *    and probe again - this keeps quality acceptable instead of crushing it.
 * 2. Once something fits, binary-search the quality upwards so we use the full size budget.
 */
export async function compressImageToTarget(
  loaded: LoadedImage,
  targetBytes: number,
  onProgress?: (percent: number) => void,
): Promise<ImageCompressResult> {
  const { img, width: naturalW, height: naturalH } = loaded
  const minScale = Math.min(1, MIN_SIDE / Math.min(naturalW, naturalH))
  let scale = maxSafeScale(naturalW, naturalH)
  let smallest: ImageCompressResult | null = null
  let steps = 0
  const bump = () => onProgress?.(Math.min(95, 10 + steps++ * 7))

  for (let round = 0; round < 8; round++) {
    const w = Math.max(1, Math.round(naturalW * scale))
    const h = Math.max(1, Math.round(naturalH * scale))
    const canvas = drawToCanvas(img, w, h)
    try {
      const probe = await canvasToJpeg(canvas, QUALITY_FLOOR)
      bump()
      await nextTick()
      if (!smallest || probe.size < smallest.blob.size) {
        smallest = { blob: probe, width: w, height: h, reachedTarget: probe.size <= targetBytes }
      }

      if (probe.size > targetBytes) {
        if (scale <= minScale) break // can't shrink any further
        // JPEG size shrinks roughly with the pixel count, so aim a little under the target
        const next = scale * Math.sqrt(targetBytes / probe.size) * 0.96
        scale = Math.max(minScale, Math.min(next, scale * 0.9))
        continue
      }

      // The floor fits - now search for the best quality that still fits.
      let best: Blob = probe
      const top = await canvasToJpeg(canvas, QUALITY_CEIL)
      bump()
      if (top.size <= targetBytes) {
        best = top
      } else {
        let lo = QUALITY_FLOOR
        let hi = QUALITY_CEIL
        for (let i = 0; i < 7; i++) {
          const mid = (lo + hi) / 2
          const blob = await canvasToJpeg(canvas, mid)
          bump()
          await nextTick()
          if (blob.size <= targetBytes) {
            best = blob
            lo = mid
            if (blob.size >= targetBytes * 0.93) break // close enough to the target
          } else {
            hi = mid
          }
        }
      }
      return { blob: best, width: w, height: h, reachedTarget: true }
    } finally {
      releaseCanvas(canvas)
    }
  }

  // Could not reach the target - hand back the smallest thing we produced.
  return smallest as ImageCompressResult
}
