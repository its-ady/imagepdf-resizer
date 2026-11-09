import { Metadata } from "next"
import { ToolPageHeader } from "@/components/tool-page-header"
import { ImageResizer } from "@/components/image-resizer"

export const metadata: Metadata = {
  title: "Image Resizer - Image & PDF Resizer",
  description: "Compress JPEG, PNG, WebP, BMP & GIF images to your desired file size.",
}

export default function ImagePage() {
  return (
    <div className="min-h-dvh bg-background">
      <ToolPageHeader title="Image Resizer" />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Compress JPEG, PNG, WebP, BMP & GIF images to your desired file size
        </p>
        <ImageResizer />
      </main>

      <footer className="border-t border-border bg-card py-4">
        <p className="text-center text-xs text-muted-foreground">
          All processing happens in your browser. Your files never leave your device.
        </p>
      </footer>
    </div>
  )
}
