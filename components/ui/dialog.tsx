"use client";

import type { ComponentProps } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

type DialogContentProps = ComponentProps<typeof RadixDialog.Content> & {
  title: string;
  description?: string;
  /** Hides the title/description visually while keeping them for a11y. */
  hideHeader?: boolean;
};

export function DialogContent({
  title,
  description,
  hideHeader,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={`fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 sm:p-6 ${className ?? ""}`}
        {...props}
      >
        <div className={hideHeader ? "sr-only" : "mb-4"}>
          <RadixDialog.Title className="text-lg font-semibold text-foreground">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">
              {description}
            </RadixDialog.Description>
          ) : null}
        </div>

        <RadixDialog.Close
          aria-label="Close"
          className="absolute end-4 top-4 rounded-lg p-1 text-subtle transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </RadixDialog.Close>

        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
