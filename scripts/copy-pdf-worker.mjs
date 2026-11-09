// Copies the pdf.js worker from node_modules into /public so it is served from our own origin
// (no CDN, works offline, version always matches the installed pdfjs-dist).
import { copyFileSync, existsSync } from 'node:fs'

const src = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url)
const dest = new URL('../public/pdf.worker.min.mjs', import.meta.url)

if (existsSync(src)) {
  copyFileSync(src, dest)
  console.log('pdf.js worker copied to public/pdf.worker.min.mjs')
} else if (existsSync(dest)) {
  console.warn('pdfjs-dist not installed - using the worker already in public/')
} else {
  console.error('pdf.js worker not found. Run your package manager install first.')
  process.exit(1)
}
