import * as React from "react"

import { cn } from "@/lib/utils"

// Thin styled wrapper around the native <select> — consolidates the class
// string that was copy-pasted across QuizModal, BrandVoiceForm, AccountCard
// and SyncButton. Native (not a Radix Select) so it keeps working inside
// forms and controlled-value patterns exactly like a plain <select>.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 rounded-lg border border-border-strong bg-surface-2 px-2 text-base text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Select }
