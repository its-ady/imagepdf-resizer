"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"

let warmed = false

/** Resolves once the service worker controls this page (so the requests below really get cached). */
async function whenControlled(): Promise<boolean> {
  await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) return true
  return new Promise<boolean>((resolve) => {
    const done = (value: boolean) => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange)
      clearTimeout(timer)
      resolve(value)
    }
    const onChange = () => done(true)
    const timer = setTimeout(() => done(false), 20_000)
    navigator.serviceWorker.addEventListener("controllerchange", onChange)
  })
}

/**
 * The PDF engine, the PDF writer and the pdf.js worker are loaded on demand, so a visitor who only
 * opened the home page would not have them cached. Fetch them once, when the browser is idle, so every
 * tool works offline afterwards. Skipped when the user has "Data Saver" turned on.
 */
async function warmHeavyModules() {
  if (warmed) return
  warmed = true
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return
  // On the very first visit the worker has to take control first, otherwise these requests bypass its cache.
  if (!(await whenControlled())) return

  const run = async () => {
    try {
      await Promise.all([
        import("pdf-lib"),
        import("@/lib/pdfjs").then((m) => m.loadPdfJs()),
        fetch("/pdf.worker.min.mjs"),
      ])
    } catch {
      /* best effort only */
    }
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => void run(), { timeout: 5000 })
  } else {
    setTimeout(() => void run(), 2000)
  }
}

export function PwaRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    // The service worker would cache development chunks and confuse hot reloading.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return

    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    const onControllerChange = () => {
      // First-ever install also changes the controller - only reload after a real update.
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`)
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting)
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(worker)
            }
          })
        })
        void warmHeavyModules()
      })
      .catch((error) => console.error("Service worker registration failed:", error))

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  if (!waitingWorker) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-4">
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <RefreshCw className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-card-foreground">New version available</p>
          <p className="text-xs text-muted-foreground">Update to get the latest improvements.</p>
        </div>
        <Button size="sm" onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}>
          Update
        </Button>
      </div>
    </div>
  )
}
