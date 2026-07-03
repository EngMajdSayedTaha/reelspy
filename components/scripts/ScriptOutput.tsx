"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ScriptResult = {
  hook: string;
  body: string;
  cta: string;
};

type ScriptOutputProps = {
  script: ScriptResult;
};

function CopyButton({ text, label }: { text: string; label?: string }) {
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
      className="text-xs text-subtle transition hover:text-brand"
    >
      {copied ? "Copied!" : label ?? "Copy"}
    </button>
  );
}

export function ScriptOutput({ script }: ScriptOutputProps) {
  const fullScript = `[HOOK]\n${script.hook}\n\n[BODY]\n${script.body}\n\n[CTA]\n${script.cta}`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center justify-end gap-2">
        <CopyButton text={fullScript} label="Copy All" />
      </div>

      <div className="space-y-3">
        {/* Hook */}
        <div className="rounded-md border-l-2 border-primary bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-subtle">Hook</p>
            <CopyButton text={script.hook} />
          </div>
          <p className="mt-1 text-sm text-foreground break-words">{script.hook}</p>
        </div>

        {/* Body */}
        <div className="rounded-md border-l-2 border-blue-500/50 bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-subtle">Body</p>
            <CopyButton text={script.body} />
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{script.body}</p>
        </div>

        {/* CTA */}
        <div className="rounded-md border-l-2 border-success/50 bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-subtle">CTA</p>
            <CopyButton text={script.cta} />
          </div>
          <p className="mt-1 text-sm text-foreground break-words">{script.cta}</p>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(fullScript)}>
        Copy Full Script
      </Button>
    </div>
  );
}
