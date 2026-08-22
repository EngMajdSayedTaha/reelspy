// Start a queued publish now, without holding the response open.
//
// "Post now" enqueues a `publish_post` job like everything else, but a user who
// just pressed Post should not wait for the next cron tick — that is every 5
// minutes on the GitHub Actions schedule. So after the response is sent we poke
// `/api/cron/run-jobs`, which claims the job and runs the dispatcher inside its
// own 300s invocation. Exactly the self-recall pattern that route already uses
// on itself when a batch fills up.
//
// This replaced calling `dispatchPost` inline from the server action. Inline was
// never survivable: Instagram polls its container for minutes, a carousel is a
// dozen platform round-trips, and the YouTube upload streams the whole file —
// all of it inside a request the browser is waiting on.
//
// Everything here is best-effort by design. If the poke fails, the job is still
// queued and the next scheduled run picks it up; the user sees "publishing"
// either way, just later.

import "server-only";
import { after } from "next/server";
import { getSiteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPost } from "./dispatcher";

export function kickPublishWorker(postId: string): void {
  const secret = process.env.CRON_SECRET;

  after(async () => {
    // Local dev with no CRON_SECRET: /api/cron/run-jobs fails closed and would
    // reject the poke, so run the dispatcher directly. Still off the response
    // path, so the composer stays snappy.
    if (!secret) {
      try {
        await dispatchPost(createAdminClient(), postId);
      } catch (error) {
        console.warn(
          "[kickPublishWorker] inline dispatch failed:",
          error instanceof Error ? error.message : error
        );
      }
      return;
    }

    try {
      await fetch(`${getSiteUrl()}/api/cron/run-jobs`, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
    } catch (error) {
      // The job is queued and durable — the scheduled run will get it.
      console.warn(
        "[kickPublishWorker] worker poke failed, leaving it to the cron:",
        error instanceof Error ? error.message : error
      );
    }
  });
}
