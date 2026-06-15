"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const DEFAULT_MESSAGES = [
  "Thinking…",
  "Analyzing the reel…",
  "Studying the hook…",
  "Connecting the dots…",
  "Drafting ideas…",
  "Polishing the output…",
];

type AiThinkingProps = {
  messages?: string[];
  className?: string;
};

// Animated "AI is working" indicator: a pulsing sparkle, bouncing dots, and a
// rotating set of status phrases that make long AI/network tasks feel alive.
export function AiThinking({ messages = DEFAULT_MESSAGES, className }: AiThinkingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 ${className ?? ""}`}
    >
      <Sparkles className="h-5 w-5 shrink-0 animate-pulse text-brand" />

      <span key={index} className="text-sm text-muted-foreground transition-opacity duration-300">
        {messages[index]}
      </span>

      <span className="ml-auto flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </span>
    </div>
  );
}
