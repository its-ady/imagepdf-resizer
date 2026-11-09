/** Starts a download for an existing object URL. */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Downloads a Blob. The object URL is revoked late on purpose: revoking right after click()
 * cancels the download in some browsers (notably Safari / iOS).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  downloadUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
