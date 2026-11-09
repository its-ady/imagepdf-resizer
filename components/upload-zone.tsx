"use client"

import { useCallback, useState } from "react"
import { Upload, ImageIcon, FileText } from "lucide-react"

interface UploadZoneProps {
  accept: string
  label: string
  icon: "image" | "pdf"
  onFileSelect: (file: File) => void
}

/**
 * A <label> wrapping a visually-hidden file input: clicking, keyboard (Enter/Space) and
 * drag & drop all work, and there is no interactive element nested inside a <button>.
 */
export function UploadZone({ accept, label, icon, onFileSelect }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
    e.target.value = "" // allow picking the same file again
  }

  const IconComponent = icon === "image" ? ImageIcon : FileText

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        group block w-full cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
        focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2
        ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
        }
      `}
    >
      <input type="file" accept={accept} onChange={handleChange} className="sr-only" aria-label={label} />
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
          <IconComponent className="size-7" />
        </div>
        <div>
          <p className="font-[family-name:var(--font-heading)] text-base font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">Tap to upload or drag & drop</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <Upload className="size-3.5" />
          Browse Files
        </div>
      </div>
    </label>
  )
}
