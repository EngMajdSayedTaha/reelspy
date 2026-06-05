// Shared types for the pluggable reel-transcription pipeline.
//
// The pipeline tries a set of providers in order and returns either a ready
// transcript or a typed "unavailable" result. It never throws to the caller —
// failures degrade gracefully, mirroring the fallback pattern in lib/ai/claude.ts.

export type TranscriptionSource = "groq" | "huggingface";

export type TranscriptStatus = "none" | "pending" | "ready" | "failed";

export type TranscribeInput = {
  // The reel's public permalink (used by URL-based providers).
  permalink: string;
  // The downloadable video/audio URL, when available. Business-Discovery reels
  // usually do NOT expose this, so audio-based providers may be skipped.
  mediaUrl?: string | null;
};

export type TranscriptReady = {
  status: "ready";
  text: string;
  language: string | null;
  source: TranscriptionSource;
  durationMs: number;
};

export type TranscriptUnavailable = {
  status: "unavailable";
  reason: string;
};

export type TranscriptResult = TranscriptReady | TranscriptUnavailable;

export type TranscriptionProvider = {
  name: TranscriptionSource;
  // True when the required env keys for this provider are present.
  isConfigured: () => boolean;
  // True when this provider needs a downloadable media URL (audio-based ASR).
  requiresMedia: boolean;
  // Performs the transcription. Throws on failure; the orchestrator catches it.
  transcribe: (input: TranscribeInput) => Promise<{ text: string; language: string | null }>;
};
