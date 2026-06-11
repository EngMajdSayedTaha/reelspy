"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { getClientPrefs } from "@/lib/prefs"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  // How long toasts stay on screen: user preference (Settings) wins, then the
  // env default, then 5s. Read after mount so SSR markup stays deterministic.
  const envDefault = Number(process.env.NEXT_PUBLIC_TOAST_DURATION_MS) || 5000
  const [duration, setDuration] = useState(envDefault)
  useEffect(() => {
    const sync = () => setDuration(getClientPrefs().toastMs || envDefault)
    sync()
    // Settings dispatches this after saving so the new duration applies
    // immediately, without a reload.
    window.addEventListener("reelspy:prefs", sync)
    return () => window.removeEventListener("reelspy:prefs", sync)
  }, [envDefault])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={duration}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
