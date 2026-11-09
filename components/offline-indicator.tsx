"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { WifiOff, Wifi } from "lucide-react"

function subscribe(callback: () => void) {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

export function OfflineIndicator() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // server render: assume online
  )
  const [showReconnected, setShowReconnected] = useState(false)
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    const show = setTimeout(() => setShowReconnected(true), 0)
    const hide = setTimeout(() => setShowReconnected(false), 3000)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [isOnline])

  if (isOnline && !showReconnected) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[60] animate-in slide-in-from-top duration-300">
      {!isOnline ? (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-950">
          <WifiOff className="size-4" />
          <span>You are offline — your files never leave this device, and the tools keep working.</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground">
          <Wifi className="size-4" />
          <span>Back online</span>
        </div>
      )}
    </div>
  )
}
