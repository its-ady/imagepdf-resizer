export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** "photo.final.png" -> "photo.final" */
export function baseName(filename: string, fallback = "file"): string {
  const name = filename.replace(/\.[^.]+$/, "")
  return name || fallback
}

/** Shared "sleep one tick" so long loops let the browser repaint (progress bar, cancel button). */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
