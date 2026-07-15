"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { useDict } from "@/lib/i18n/I18nProvider";

type ScriptResult = {
  hook: string;
  body: string;
  cta: string;
};

type ScriptOutputProps = {
  script: ScriptResult;
};

type ScriptsCopy = ReturnType<typeof useDict>["scripts"];

function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-subtle transition hover:text-accent-brand"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

// Reveals hook → body → cta in sequence, like the AI is typing it live.
// Keyed by the script's content in the parent, so a fresh script remounts
// this (and resets `stage` to 0) instead of needing an effect-based reset.
function ScriptSections({ script, s }: { script: ScriptResult; s: ScriptsCopy }) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);

  return (
    <div className="space-y-3">
      {/* Hook */}
      <div className="rounded-md border-s-2 border-primary bg-background p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-subtle">{s.hook}</p>
          <CopyButton text={script.hook} label={s.copy} copiedLabel={s.copied} />
        </div>
        <p className="mt-1 text-sm text-foreground break-words">
          {stage >= 1 ? script.hook : <TypewriterText text={script.hook} onDone={() => setStage(1)} />}
        </p>
      </div>

      {/* Body */}
      <div className="rounded-md border-s-2 border-info/50 bg-background p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-subtle">{s.body}</p>
          <CopyButton text={script.body} label={s.copy} copiedLabel={s.copied} />
        </div>
        <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">
          {stage >= 2 ? (
            script.body
          ) : stage === 1 ? (
            <TypewriterText text={script.body} onDone={() => setStage(2)} />
          ) : null}
        </p>
      </div>

      {/* CTA */}
      <div className="rounded-md border-s-2 border-success/50 bg-background p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-subtle">{s.cta}</p>
          <CopyButton text={script.cta} label={s.copy} copiedLabel={s.copied} />
        </div>
        <p className="mt-1 text-sm text-foreground break-words">
          {stage >= 3 ? (
            script.cta
          ) : stage === 2 ? (
            <TypewriterText text={script.cta} onDone={() => setStage(3)} />
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function ScriptOutput({ script }: ScriptOutputProps) {
  const dict = useDict();
  const s = dict.scripts;
  const fullScript = `[HOOK]\n${script.hook}\n\n[BODY]\n${script.body}\n\n[CTA]\n${script.cta}`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center justify-end gap-2">
        <CopyButton text={fullScript} label={s.copyAll} copiedLabel={s.copied} />
      </div>

      <ScriptSections key={fullScript} script={script} s={s} />

      <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(fullScript)}>
        {s.copyFullScript}
      </Button>
    </div>
  );
}
