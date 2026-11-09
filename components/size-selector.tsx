"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SizeSelectorProps {
  onSizeSelect: (sizeInBytes: number | null) => void
  selectedSize: number | null
}

const PRESET_SIZES = [
  { label: "30 KB", bytes: 30 * 1024 },
  { label: "50 KB", bytes: 50 * 1024 },
  { label: "100 KB", bytes: 100 * 1024 },
  { label: "200 KB", bytes: 200 * 1024 },
  { label: "500 KB", bytes: 500 * 1024 },
  { label: "1 MB", bytes: 1024 * 1024 },
  { label: "2 MB", bytes: 2 * 1024 * 1024 },
]

function toBytes(value: string, unit: "KB" | "MB"): number | null {
  const num = parseFloat(value)
  if (!Number.isFinite(num) || num <= 0) return null
  const bytes = Math.round(num * (unit === "MB" ? 1024 * 1024 : 1024))
  return bytes >= 1024 ? bytes : null // anything under 1 KB is not a usable target
}

export function SizeSelector({ onSizeSelect, selectedSize }: SizeSelectorProps) {
  const [customValue, setCustomValue] = useState("")
  const [customUnit, setCustomUnit] = useState<"KB" | "MB">("KB")
  const [isCustom, setIsCustom] = useState(false)

  const handlePresetClick = (bytes: number) => {
    setIsCustom(false)
    setCustomValue("")
    onSizeSelect(bytes)
  }

  const handleCustomChange = (value: string) => {
    setCustomValue(value)
    setIsCustom(true)
    // An empty/invalid custom value clears the selection, so we never compress to a stale preset.
    onSizeSelect(toBytes(value, customUnit))
  }

  const handleUnitToggle = () => {
    const newUnit = customUnit === "KB" ? "MB" : "KB"
    setCustomUnit(newUnit)
    if (isCustom) onSizeSelect(toBytes(customValue, newUnit))
  }

  return (
    <div className="flex flex-col gap-4">
      <Label className="font-[family-name:var(--font-heading)] text-sm font-semibold text-foreground">
        Select Target Size
      </Label>
      <div className="flex flex-wrap gap-2">
        {PRESET_SIZES.map((size) => (
          <button
            key={size.label}
            type="button"
            onClick={() => handlePresetClick(size.bytes)}
            aria-pressed={!isCustom && selectedSize === size.bytes}
            className={`
              rounded-lg px-3.5 py-2 text-sm font-medium transition-all
              ${
                !isCustom && selectedSize === size.bytes
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary"
              }
            `}
          >
            {size.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="custom-size" className="text-xs text-muted-foreground">
          Or enter custom size
        </Label>
        <div className="flex gap-2">
          <Input
            id="custom-size"
            type="number"
            inputMode="decimal"
            placeholder="Enter size..."
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            min={1}
            className={`flex-1 ${isCustom && customValue ? "border-primary ring-1 ring-primary/30" : ""}`}
          />
          <button
            type="button"
            onClick={handleUnitToggle}
            aria-label={`Unit: ${customUnit}. Tap to switch`}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-primary/10"
          >
            {customUnit}
          </button>
        </div>
      </div>
    </div>
  )
}
