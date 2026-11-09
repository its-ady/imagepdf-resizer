"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RotateCcw, Check, AlertCircle, ImageIcon, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { UploadZone } from "@/components/upload-zone"
import { SizeSelector } from "@/components/size-selector"
import { baseName, formatSize } from "@/lib/format"
import { downloadUrl } from "@/lib/download"
import { compressImageToTarget, loadImage, type LoadedImage } from "@/lib/image-compress"

interface ResultState {
  blob: Blob
  url: string
  filename: string
  /** "original" = we returned the untouched file (already small enough, or can't be improved) */
  kind: "compressed" | "original"
  reachedTarget: boolean
  width?: number
  height?: number
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i

export function ImageResizer() {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [targetSize, setTargetSize] = useState<number | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ResultState | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Object URLs are revoked automatically whenever they are replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const resultUrl = result?.url
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [resultUrl])

  const handleFileSelect = useCallback((selected: File) => {
    if (!selected.type.startsWith("image/") && !IMAGE_EXTENSIONS.test(selected.name)) {
      setError("Please select an image file (JPEG, PNG, WebP, etc.)")
      return
    }
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setError(null)
    setResult(null)
    setProgress(0)
  }, [])

  const compress = async () => {
    if (!file || !targetSize) return
    setCompressing(true)
    setError(null)
    setResult(null)
    setProgress(5)

    let loaded: LoadedImage | null = null
    try {
      // Already small enough: don't touch it (re-encoding could even make it bigger).
      if (file.size <= targetSize) {
        setResult({
          blob: file,
          url: URL.createObjectURL(file),
          filename: file.name,
          kind: "original",
          reachedTarget: true,
        })
        setProgress(100)
        return
      }

      loaded = await loadImage(file)
      setProgress(10)
      const output = await compressImageToTarget(loaded, targetSize, setProgress)

      if (output.blob.size >= file.size) {
        // Nothing we can do beats the original - never hand back a bigger file.
        setResult({
          blob: file,
          url: URL.createObjectURL(file),
          filename: file.name,
          kind: "original",
          reachedTarget: false,
        })
      } else {
        setResult({
          blob: output.blob,
          url: URL.createObjectURL(output.blob),
          filename: `${baseName(file.name, "image")}_resized.jpg`,
          kind: "compressed",
          reachedTarget: output.reachedTarget,
          width: output.width,
          height: output.height,
        })
      }
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compression failed")
    } finally {
      loaded?.release()
      setCompressing(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreviewUrl(null)
    setTargetSize(null)
    setCompressing(false)
    setProgress(0)
    setResult(null)
    setError(null)
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <UploadZone accept="image/*" label="Upload Image" icon="image" onFileSelect={handleFileSelect} />
        {error && <ErrorMessage text={error} />}
      </div>
    )
  }

  const reduced = result ? Math.max(0, Math.round((1 - result.blob.size / file.size) * 100)) : 0

  return (
    <div className="flex flex-col gap-5">
      {/* File info */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Preview" className="size-14 shrink-0 rounded-lg object-cover shadow-sm" />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ImageIcon className="size-6 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">Original: {formatSize(file.size)}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleReset} className="shrink-0">
          <RotateCcw className="size-4" />
          <span className="sr-only">Reset</span>
        </Button>
      </div>

      <SizeSelector onSizeSelect={setTargetSize} selectedSize={targetSize} />

      <Button
        onClick={compress}
        disabled={!targetSize || compressing}
        className="w-full gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
        size="lg"
      >
        {compressing ? (
          <>
            <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            Compressing...
          </>
        ) : (
          <>
            <ImageIcon className="size-4" />
            Compress Image
          </>
        )}
      </Button>

      {compressing && (
        <div className="flex flex-col gap-2">
          <Progress value={progress} className="h-2" />
          <p className="text-center text-xs text-muted-foreground">{progress}% complete</p>
        </div>
      )}

      {error && <ErrorMessage text={error} />}

      {result && (
        <div
          className={`flex flex-col gap-4 rounded-xl border p-4 ${
            result.reachedTarget ? "border-accent/30 bg-accent/5" : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                result.reachedTarget ? "bg-accent text-accent-foreground" : "bg-amber-500 text-white"
              }`}
            >
              {result.reachedTarget ? <Check className="size-4" /> : <Info className="size-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {result.kind === "original"
                  ? result.reachedTarget
                    ? "Already under your target"
                    : "Can't be made smaller"
                  : result.reachedTarget
                    ? "Compression Complete"
                    : "Target not reachable"}
              </p>

              {result.kind === "compressed" && (
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)} → {formatSize(result.blob.size)}
                  <span className="ml-1 font-semibold text-accent">({reduced}% reduced)</span>
                  {result.width && result.height ? ` · JPG ${result.width}×${result.height}px` : ""}
                </p>
              )}

              {result.kind === "original" && result.reachedTarget && targetSize && (
                <p className="text-xs text-muted-foreground">
                  This image is {formatSize(file.size)}, already below {formatSize(targetSize)}. It is returned
                  unchanged so quality isn&apos;t lost.
                </p>
              )}

              {result.kind === "original" && !result.reachedTarget && (
                <p className="text-xs text-muted-foreground">
                  Re-encoding this image can&apos;t get it below {formatSize(file.size)}, so the original is
                  returned.
                </p>
              )}

              {result.kind === "compressed" && !result.reachedTarget && targetSize && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Could not reach {formatSize(targetSize)} — {formatSize(result.blob.size)} is the smallest
                  achievable for this image.
                </p>
              )}
            </div>
          </div>

          {result.kind === "compressed" && (
            <div className="overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="Compressed preview" className="max-h-48 w-full object-contain" />
            </div>
          )}

          <Button
            onClick={() => downloadUrl(result.url, result.filename)}
            className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            size="lg"
          >
            <Download className="size-4" />
            Download ({formatSize(result.blob.size)})
          </Button>
        </div>
      )}
    </div>
  )
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      {text}
    </div>
  )
}
