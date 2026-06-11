"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ScriptResult = {
  hook: string;
  body: string;
  cta: string;
  viral_pattern: string;
};

type ScriptOutputProps = {
  script: ScriptResult;
  explanation?: string | null;
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
      className="text-xs text-zinc-500 transition hover:text-[#F9E400]"
    >
      {copied ? "Copied!" : label ?? "Copy"}
    </button>
  );
}

export function ScriptOutput({ script, explanation }: ScriptOutputProps) {
  const fullScript = `[HOOK]\n${script.hook}\n\n[BODY]\n${script.body}\n\n[CTA]\n${script.cta}`;

  return (
    <div className="space-y-3 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 text-zinc-100">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-300">
          Pattern: <span className="text-[#F9E400]">{script.viral_pattern}</span>
        </p>
        <CopyButton text={fullScript} label="Copy All" />
      </div>

      <div className="space-y-3">
        {/* Hook */}
        <div className="rounded-md border-l-2 border-[#F9E400] bg-[#0d0d0d] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Hook</p>
            <CopyButton text={script.hook} />
          </div>
          <p className="mt-1 text-sm text-white">{script.hook}</p>
        </div>

        {/* Body */}
        <div className="rounded-md border-l-2 border-blue-500/50 bg-[#0d0d0d] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Body</p>
            <CopyButton text={script.body} />
          </div>
          <p className="mt-1 break-words whitespace-pre-line text-sm text-white">{script.body}</p>
        </div>

        {/* CTA */}
        <div className="rounded-md border-l-2 border-emerald-500/50 bg-[#0d0d0d] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-zinc-500">CTA</p>
            <CopyButton text={script.cta} />
          </div>
          <p className="mt-1 text-sm text-white">{script.cta}</p>
        </div>
      </div>

      {explanation ? (
        <div className="rounded-md border border-zinc-800 bg-[#0c0c0c] p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Why this pattern works</p>
          <p className="mt-1 text-sm text-zinc-300">{explanation}</p>
        </div>
      ) : null}

      <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(fullScript)}>
        Copy Full Script
      </Button>
    </div>
  );
}
