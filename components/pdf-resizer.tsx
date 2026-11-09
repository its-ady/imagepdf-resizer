"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, RotateCcw, Check, AlertCircle, FileText, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { UploadZone } from "@/components/upload-zone"
import { SizeSelector } from "@/components/size-selector"
import { baseName, formatSize } from "@/lib/format"
import { downloadUrl } from "@/lib/download"
import { friendlyPdfError, isAbortError } from "@/lib/pdfjs"
import { compressPdf, type PdfCompressResult } from "@/lib/pdf-compress"

interface ResultState extends PdfCompressResult {
  url: string
}

const METHOD_LABEL: Record<PdfCompressResult["method"], string> = {
  original: "Original file (unchanged)",
  optimized: "Lossless optimization — content unchanged",
  images: "Images re-compressed — text and vectors unchanged",
  "pages-as-images": "Pages converted to images",
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name)
}

export function PdfResizer() {
  const [file, setFile] = useState<File | null>(null)
  const [targetSize, setTargetSize] = useState<number | null>(null)
  const [keepText, setKeepText] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ResultState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // Revoke the download URL when it is replaced / on unmount, and stop any running job on unmount.
  const resultUrl = result?.url
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [resultUrl])
  useEffect(() => () => controllerRef.current?.abort(), [])

  const handleFileSelect = useCallback((selected: File) => {
    if (!isPdf(selected)) {
      setError("Please select a PDF file")
      return
    }
    setFile(selected)
    setError(null)
    setResult(null)
    setProgress(0)
  }, [])

  const compress = async () => {
    if (!file || !targetSize) return
    const controller = new AbortController()
    controllerRef.current = controller

    setCompressing(true)
    setError(null)
    setResult(null)
    setProgress(3)

    try {
      const buffer = await file.arrayBuffer()
      const output = await compressPdf(buffer, {
        targetBytes: targetSize,
        keepText,
        signal: controller.signal,
        onProgress: (p) => {
          if (!controller.signal.aborted) setProgress(p)
        },
      })
      if (controller.signal.aborted) return
      setResult({ ...output, url: URL.createObjectURL(output.blob) })
      setProgress(100)
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return
      console.error("PDF compression error:", err)
      setError(friendlyPdfError(err))
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setCompressing(false)
      }
    }
  }

  const cancel = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setCompressing(false)
    setProgress(0)
  }

  const handleReset = () => {
    cancel()
    setFile(null)
    setTargetSize(null)
    setResult(null)
    setError(null)
  }

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <UploadZone accept="application/pdf,.pdf" label="Upload PDF" icon="pdf" onFileSelect={handleFileSelect} />
        {error && <ErrorMessage text={error} />}
      </div>
    )
  }

  const reduced = result ? Math.max(0, Math.round((1 - result.blob.size / file.size) * 100)) : 0
  const unchanged = result?.method === "original"

  return (
    <div className="flex flex-col gap-5">
      {/* File info */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
          <FileText className="size-6 text-destructive" />
        </div>
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

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-left">
        <input
          type="checkbox"
          checked={keepText}
          onChange={(e) => setKeepText(e.target.checked)}
          disabled={compressing}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span className="text-sm">
          <span className="font-medium text-foreground">Keep text selectable</span>
          <span className="block text-xs text-muted-foreground">
            Never turn pages into images. Text stays searchable, but small targets may not be reachable.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button
          onClick={compress}
          disabled={!targetSize || compressing}
          className="flex-1 gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
          size="lg"
        >
          {compressing ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Compressing...
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Compress PDF
            </>
          )}
        </Button>
        {compressing && (
          <Button onClick={cancel} variant="outline" size="lg" className="gap-1.5">
            <X className="size-4" />
            Cancel
          </Button>
        )}
      </div>

      {compressing && (
        <div className="flex flex-col gap-2">
          <Progress value={progress} className="h-2" />
          <p className="text-center text-xs text-muted-foreground">Compressing... {progress}%</p>
        </div>
      )}

      {error && <ErrorMessage text={error} />}

      {result && (
        <div
          className={`flex flex-col gap-4 rounded-xl border p-4 ${
            result.reachedTarget && result.textPreserved
              ? "border-accent/30 bg-accent/5"
              : "border-amber-500/40 bg-amber-500/5"
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
                {unchanged
                  ? result.reachedTarget
                    ? "Already under your target"
                    : "Can't be made smaller"
                  : result.reachedTarget
                    ? "Compression Complete"
                    : "Target not reachable"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatSize(file.size)} → {formatSize(result.blob.size)}
                {!unchanged && <span className="ml-1 font-semibold text-accent">({reduced}% reduced)</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{METHOD_LABEL[result.method]}</p>

              {!result.reachedTarget && targetSize && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Could not reach {formatSize(targetSize)}
                  {keepText ? " while keeping the text. Untick “Keep text selectable” to try harder." : "."}
                </p>
              )}
              {result.method === "pages-as-images" && !result.textPreserved && (
                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Text in this PDF is no longer selectable or searchable — every page is now a picture.
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={() => downloadUrl(result.url, unchanged ? file.name : `${baseName(file.name, "document")}_compressed.pdf`)}
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
