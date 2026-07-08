"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// A plain native <input type="range"> styled to match the design system,
// rather than pulling in a new Radix dependency for one control. Single-thumb
// only — sufficient for the dynamic plan card's sliders.
function Slider({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn(
        "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none",
        "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none",
        "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
        "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow",
        "[&::-webkit-slider-thumb]:cursor-pointer",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
        "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow",
        "[&::-moz-range-thumb]:cursor-pointer",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

export { Slider }
