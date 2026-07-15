"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertDialog } from "radix-ui";
import { useDict } from "@/lib/i18n/I18nProvider";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const common = useDict().common;
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    if (resolver.current) {
      resolver.current(result);
      resolver.current = null;
    }
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <AlertDialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) settle(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="text-lg font-semibold text-foreground">
              {options.title ?? common.areYouSure}
            </AlertDialog.Title>
            {options.description ? (
              <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {options.description}
              </AlertDialog.Description>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="h-9 rounded-lg border border-border-strong bg-surface-2 px-4 text-sm text-muted-foreground transition hover:border-border-strong"
              >
                {options.cancelText ?? common.cancel}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${
                  options.destructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary-hover"
                }`}
              >
                {options.confirmText ?? common.confirm}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}
