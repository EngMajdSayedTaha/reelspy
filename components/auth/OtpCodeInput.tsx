"use client";

// Six-box entry field for the emailed verification code. The boxes are purely
// presentational: the component is controlled by ONE string and every edit is
// reduced by the pure helpers in lib/auth/otp.ts, so paste, typing, autofill
// and backspace can't produce a state the submit guard disagrees with.

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  OTP_LENGTH,
  applyOtpBackspace,
  applyOtpInput,
  applyOtpPaste,
  type OtpEdit,
} from "@/lib/auth/otp";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the 6th digit lands, so the parent can auto-submit. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** True after a failed attempt: paints the boxes red and marks them invalid. */
  invalid?: boolean;
  /** Localized group label; each box is announced as "<label> 1", "<label> 2"… */
  label: string;
  autoFocus?: boolean;
};

export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  label,
  autoFocus = true,
}: OtpCodeInputProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  const focusBox = (index: number) => {
    const box = boxes.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))];
    box?.focus();
    box?.select();
  };

  const commit = (edit: OtpEdit) => {
    onChange(edit.value);
    focusBox(edit.caret);
    if (edit.value.length === OTP_LENGTH) onComplete?.(edit.value);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      commit(applyOtpBackspace(value, index));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const edit = applyOtpPaste(value, index, event.clipboardData.getData("text"));
    if (!edit) return;
    event.preventDefault();
    commit(edit);
  };

  return (
    // dir=ltr pins digit order under the Arabic locale too: a code is a number,
    // not prose, so box 1 stays leftmost in both directions.
    <div dir="ltr" role="group" aria-label={label} className="flex justify-between gap-2">
      {Array.from({ length: OTP_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          value={value[index] ?? ""}
          onChange={(event) => commit(applyOtpInput(value, index, event.target.value))}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          // Only the first box advertises one-time-code, so the OS autofill
          // suggestion drops the whole code in once (handled by the
          // multi-digit path) instead of offering itself six times.
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 w-full min-w-0 rounded-lg border border-input bg-transparent text-center text-lg font-semibold tabular-nums transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-input/30",
            invalid && "border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40"
          )}
        />
      ))}
    </div>
  );
}
