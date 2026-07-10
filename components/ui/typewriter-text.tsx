"use client";

import { useEffect, useState } from "react";

type TypewriterTextProps = {
  text: string;
  speedMs?: number;
  className?: string;
  caretClassName?: string;
  onDone?: () => void;
};

// Reveals `text` word by word, like an AI typing its answer, with a blinking
// caret while in progress. All state changes happen inside the interval
// callback (not the effect body) so the reveal can't trigger cascading
// synchronous renders. Mirrors the pattern proven out in GrowthNotes.
export function TypewriterText({ text, speedMs = 20, className, caretClassName, onDone }: TypewriterTextProps) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!text) {
      onDone?.();
      return;
    }

    let i = 0;
    // Split keeping whitespace tokens so re-joining preserves spacing.
    const tokens = text.split(/(\s+)/);

    const id = setInterval(() => {
      i += 1;
      setShown(tokens.slice(0, i).join(""));
      if (i >= tokens.length) {
        clearInterval(id);
        onDone?.();
      }
    }, speedMs);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speedMs]);

  const done = shown === text;

  return (
    <span className={className}>
      {shown}
      {!done ? (
        <span className={caretClassName ?? "ms-0.5 inline-block w-1.5 animate-pulse text-brand"}>▍</span>
      ) : null}
    </span>
  );
}
