import Image from "next/image"
import Link from "next/link"
import {
  ImageIcon,
  FileText,
  Zap,
  Shield,
  Smartphone,
  FileImage,
  FileSignature,
} from "lucide-react"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"

const tools = [
  {
    title: "Image Resizer",
    description: "Compress JPEG, PNG, WebP & more",
    href: "/image",
    icon: ImageIcon,
    color: "bg-primary/10 text-primary",
    borderColor: "hover:border-primary/40",
  },
  {
    title: "PDF Resizer",
    description: "Compress PDF files to any size",
    href: "/pdf",
    icon: FileText,
    color: "bg-destructive/10 text-destructive",
    borderColor: "hover:border-destructive/40",
  },
  {
    title: "Image to PDF",
    description: "Photos to a multi-page A4 PDF",
    href: "/image-to-pdf",
    icon: FileImage,
    color: "bg-amber-500/10 text-amber-600",
    borderColor: "hover:border-amber-500/40",
  },
  {
    title: "Sign PDF",
    description: "Add signatures privately in browser",
    href: "/sign",
    icon: FileSignature,
    color: "bg-accent/10 text-accent",
    borderColor: "hover:border-accent/40",
  },
]

export default function Home() {
  return (
    <div className="min-h-dvh bg-background">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="relative size-9 shrink-0 overflow-hidden rounded-lg shadow-sm">
            <Image
              src="/icons/icon-192.png"
              alt="Image & PDF Resizer logo"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="flex flex-col">
            <h1 className="font-[family-name:var(--font-heading)] text-base font-bold leading-tight text-foreground">
              Image & PDF Resizer
            </h1>
            <p className="text-xs text-muted-foreground">
              Compress files to any size
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Hero */}
        <section className="mb-8 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl text-balance">
            Resize Images & PDFs Instantly
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base text-pretty">
            Compress your files to the exact size you need. Fast, free, and works right in your browser.
          </p>
        </section>

        {/* Feature chips */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Zap className="size-3" />
            Lightning Fast
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
            <Shield className="size-3" />
            100% Private
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
            <Smartphone className="size-3" />
            Mobile Friendly
          </div>
        </div>

        {/* Tool Cards Grid */}
        <section className="mb-10">
          <h3 className="font-[family-name:var(--font-heading)] mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Choose a Tool
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className={`group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all active:scale-[0.97] hover:shadow-md ${tool.borderColor}`}
              >
                <div className={`flex size-12 items-center justify-center rounded-xl ${tool.color} transition-transform group-hover:scale-110`}>
                  <tool.icon className="size-6" />
                </div>
                <div className="text-center">
                  <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-foreground">
                    {tool.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-8">
          <h3 className="font-[family-name:var(--font-heading)] mb-4 text-center text-lg font-bold text-foreground">
            How It Works
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StepCard
              step={1}
              title="Upload"
              description="Select an image or PDF from your device"
            />
            <StepCard
              step={2}
              title="Choose Size"
              description="Pick a preset or enter a custom target size"
            />
            <StepCard
              step={3}
              title="Download"
              description="Get your compressed file in seconds"
            />
          </div>
        </section>

        {/* Supported formats */}
        <section className="mb-10 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-[family-name:var(--font-heading)] mb-3 text-sm font-bold text-foreground">
            Supported Formats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-primary">Images</p>
              <div className="flex flex-wrap gap-1.5">
                {["JPEG", "PNG", "WebP", "BMP", "GIF"].map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-destructive">Documents</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  PDF
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-4 pb-20">
        <p className="text-center text-xs text-muted-foreground">
          Image & PDF Resizer — All processing happens in your browser. Your files never leave your device.
        </p>
      </footer>

      <PwaInstallPrompt />
    </div>
  )
}

function StepCard({
  step,
  title,
  description,
}: {
  step: number
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      <div className="flex size-9 items-center justify-center rounded-full bg-primary font-[family-name:var(--font-heading)] text-sm font-bold text-primary-foreground">
        {step}
      </div>
      <h4 className="font-[family-name:var(--font-heading)] text-sm font-bold text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
