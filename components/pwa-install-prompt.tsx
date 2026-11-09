"use client"

import { useState, useEffect } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISSED_KEY = "pwa-install-dismissed"

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "true"
  } catch {
    return false // storage blocked (private mode etc.)
  }
}

export function PwaInstallPrompt() {
  // The banner is shown only while we hold a deferred install prompt from the browser.
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      if (wasDismissed()) return
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferredPrompt(null)

    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null) // a prompt can only be used once
  }

  const handleDismiss = () => {
    setDeferredPrompt(null)
    try {
      sessionStorage.setItem(DISMISSED_KEY, "true")
    } catch {
      /* ignore */
    }
  }

  if (!deferredPrompt) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="mx-auto max-w-2xl p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary">
            <Download className="size-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-card-foreground">Install App</p>
            <p className="truncate text-xs text-muted-foreground">Add to home screen for offline access</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={handleInstall} className="h-9 rounded-xl px-4 text-xs font-semibold">
              Install
            </Button>
            <button
              onClick={handleDismiss}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"
              aria-label="Dismiss install prompt"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
