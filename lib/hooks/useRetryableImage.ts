"use client";

import { useState } from "react";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

// Instagram's CDN occasionally 404s a just-synced thumbnail/avatar for a few
// seconds before the edge cache catches up, even though the signed URL itself
// is valid. A bare onError was permanently swapping in the placeholder for
// images that would have loaded fine moments later, with no way to recover
// short of a full page reload. `retryKey` forces the <img> to remount (and
// therefore re-request) the SAME url — appending a cache-busting query param
// instead would invalidate Instagram's URL signature and guarantee failure.
export function useRetryableImage(src: string | null | undefined) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset retry/failure state when the url itself changes (new reel/account
  // row, or a fresh sync overwrote a previously-broken url) — done during
  // render, per React's "adjusting state on prop change" guidance, not an effect.
  if (src !== prevSrc) {
    setPrevSrc(src);
    setAttempt(0);
    setFailed(false);
  }

  const onError = () => {
    if (attempt >= MAX_RETRIES) {
      setFailed(true);
      return;
    }
    const next = attempt + 1;
    setTimeout(() => setAttempt(next), RETRY_DELAY_MS * next);
  };

  return { retryKey: attempt, failed: failed || !src, onError };
}
