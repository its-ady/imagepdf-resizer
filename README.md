# Image & PDF Resizer

Private, in-browser tools: compress images to a target size, compress PDFs to a target size, turn photos into a
multi-page A4 PDF, and sign PDFs. Nothing is uploaded - every file is processed on the user's device - and the app
works offline after the first visit (PWA).

## Run it

```bash
pnpm install          # (npm install / yarn also work, but the lockfile is pnpm's)
pnpm dev              # http://localhost:3000
pnpm build && pnpm start
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
```

Requires Node 22.13 or newer (needed by `pdfjs-dist`, the PDF engine). `build` and `dev` first copy the pdf.js worker
from `node_modules` to `public/pdf.worker.min.mjs` (`scripts/copy-pdf-worker.mjs`), so pdf.js is served from your own
domain - there is no CDN at runtime.

## How the tools work

| Tool | What it does |
| --- | --- |
| Image Resizer | Re-encodes to JPG. First shrinks the pixels if needed (quality never drops below 0.45), then binary-searches the quality so the result lands just under the target. Transparent areas become white. If the file is already under the target it is returned untouched. |
| PDF Resizer | Tries, in order, and stops at the first that fits: **1)** lossless rewrite, **2)** re-compress only the embedded JPEG images (text stays selectable), **3)** render every page to an image (text is lost - the result screen says so). The "Keep text selectable" tick-box disables step 3. The output is never larger than the original. |
| Image to PDF | Multi-page A4 layout. "PDF quality" sets the pixel density of every photo at its placed size (High 220 / Medium 150 / Small 100 DPI), which is what controls the file size. |
| Sign PDF | Draw or upload a signature (uploads are trimmed and the white paper is made transparent). Placement is converted to PDF coordinates through pdf.js, so rotated pages and offset crop boxes are handled. |

## Offline / PWA

`public/sw.js` is versioned by the build id (`next.config.mjs` -> `NEXT_PUBLIC_BUILD_ID`, the Vercel commit SHA when
deployed). On install it caches every tool page and the JS/CSS/fonts they need; the PDF engine and its worker are cached
shortly after the first visit. A new deploy shows a "New version available - Update" banner; old caches are deleted
automatically, so there is no version number to bump by hand. The service worker is only registered in production
builds.

## Structure

- `app/` - pages (`/`, `/image`, `/pdf`, `/image-to-pdf`, `/sign`)
- `components/` - the four tools + shared UI (`components/ui` is shadcn: button, input, label, progress)
- `lib/` - `image-compress.ts`, `pdf-compress.ts`, `pdfjs.ts` (engine loader), `download.ts`, `format.ts`
- `public/` - manifest, icons (PNG, incl. a maskable one), service worker, offline page, pdf.js worker
