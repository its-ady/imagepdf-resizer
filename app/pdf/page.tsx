import { Metadata } from "next"
import { ToolPageHeader } from "@/components/tool-page-header"
import { PdfResizer } from "@/components/pdf-resizer"

export const metadata: Metadata = {
  title: "PDF Resizer - Image & PDF Resizer",
  description: "Compress PDF files to your desired target size.",
}

export default function PdfPage() {
  return (
    <div className="min-h-dvh bg-background">
      <ToolPageHeader title="PDF Resizer" />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Compress PDF files to your desired target size
        </p>
        <PdfResizer />
      </main>

      <footer className="border-t border-border bg-card py-4">
        <p className="text-center text-xs text-muted-foreground">
          All processing happens in your browser. Your files never leave your device.
        </p>
      </footer>
    </div>
  )
}
