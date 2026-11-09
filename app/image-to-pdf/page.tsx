import { Metadata } from "next"
import { ToolPageHeader } from "@/components/tool-page-header"
import { ImageToPdf } from "@/components/image-to-pdf"

export const metadata: Metadata = {
  title: "Image to PDF - Image & PDF Resizer",
  description:
    "Turn photos into a multi-page A4 PDF. Drag, resize, auto-grid, one photo per page, and choose the PDF quality.",
}

export default function ImageToPdfPage() {
  return (
    <div className="min-h-dvh bg-background">
      <ToolPageHeader title="Image to PDF" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-foreground">
            Arrange Photos on A4 Pages
          </h2>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Add photos, drag to position, resize from the corner, add more pages if you need them, then convert to PDF.
          </p>
        </div>
        <ImageToPdf />
      </main>
    </div>
  )
}
