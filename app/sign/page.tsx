import { Metadata } from "next"
import { ToolPageHeader } from "@/components/tool-page-header"
import { PdfSigner } from "@/components/pdf-signer"

export const metadata: Metadata = {
  title: "Sign PDF - Image & PDF Resizer",
  description: "Add signatures to PDF documents privately in your browser.",
}

export default function SignPage() {
  return (
    <div className="min-h-dvh bg-background">
      <ToolPageHeader title="Sign PDF" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Draw or upload a signature, place it on any page, and download your signed PDF.
        </p>
        <PdfSigner />
      </main>
      <footer className="border-t border-border bg-card py-4">
        <p className="text-center text-xs text-muted-foreground">
          All processing happens in your browser. Your files never leave your device.
        </p>
      </footer>
    </div>
  )
}
