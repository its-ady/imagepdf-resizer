import type { PDFDocumentProxy } from "pdfjs-dist"

type PdfJsModule = typeof import("pdfjs-dist")

let pdfJsPromise: Promise<PdfJsModule> | null = null

/**
 * Loads pdf.js from our own bundle (no CDN). The worker is served from /pdf.worker.min.mjs
 * (copied from node_modules by scripts/copy-pdf-worker.mjs), so it also works offline.
 * A failed load is not cached - the next call retries.
 */
export function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs")
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        return mod as PdfJsModule
      })
      .catch((error) => {
        pdfJsPromise = null
        throw error
      })
  }
  return pdfJsPromise
}

/** Opens a PDF with pdf.js. Call closePdf() when done to free the worker memory. */
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({
    // copy: pdf.js transfers the buffer to its worker, and we still need ours afterwards
    data: new Uint8Array(data.slice(0)),
  })
  return task.promise
}

/** Turns pdf.js / pdf-lib errors into something a normal person can act on. */
export function friendlyPdfError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name
  const message = error instanceof Error ? error.message : ""
  if (name === "PasswordException" || /password|encrypted/i.test(message)) {
    return "This PDF is password-protected. Remove the password first, then try again."
  }
  if (name === "InvalidPDFException" || /invalid pdf|no pdf header/i.test(message)) {
    return "This file doesn't look like a valid PDF."
  }
  if (/failed to fetch dynamically imported|loading chunk|importing a module script failed/i.test(message)) {
    return "Couldn't load the PDF engine. Check your connection once and try again."
  }
  return message || "Something went wrong while reading the PDF."
}

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError"
}

/** Frees everything pdf.js holds for this document. */
export function closePdf(pdf: PDFDocumentProxy) {
  void pdf.loadingTask.destroy()
}
