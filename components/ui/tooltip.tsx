"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// A real tooltip, because the codebase's existing idiom is a native `title`
// attribute — which never appears on touch, can't be styled, and takes a second
// to show. The publishing composer leans on short explanations ("why is this
// platform disabled?"), so those need to be readable on a phone too.
//
// `Tooltip` includes its own Provider so a call site can drop one in without
// wiring a provider into the layout; nesting providers is harmless in Radix.

function Tooltip({
  children,
  content,
  side = "top",
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
}) {
  if (!content) return <>{children}</>;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip-content"
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-[100] max-w-[16rem] rounded-lg border border-border bg-popover px-2.5 py-1.5",
              "text-xs leading-relaxed text-popover-foreground shadow-lg",
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
              "data-[state=delayed-open]:fade-in-0 data-[state=closed]:fade-out-0"
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-popover" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip };
