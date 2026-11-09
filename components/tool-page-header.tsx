"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

interface ToolPageHeaderProps {
  title: string
}

export function ToolPageHeader({ title }: ToolPageHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label="Go back to home"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="relative size-8 shrink-0 overflow-hidden rounded-lg shadow-sm">
          <Image
            src="/icons/icon-192.png"
            alt="Image & PDF Resizer logo"
            fill
            className="object-cover"
            priority
          />
        </div>
        <h1 className="font-[family-name:var(--font-heading)] text-base font-bold leading-tight text-foreground">
          {title}
        </h1>
      </div>
    </header>
  )
}
