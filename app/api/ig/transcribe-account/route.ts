import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics/track";
import { enqueueJob } from "@/lib/jobs/queue";
import { transcriptionConfigured } from "@/lib/media/transcribe-job";
import {
  readTranscribeAccountStatus,
  transcribeAccountDedupKey,
} from "@/lib/media/transcribe-account-status";

// Bulk transcription of one tracked account's reels. POST starts a run; GET
// reports progress.
//
// This route only decides whether the user may ask and wakes the worker — the
// transcription itself runs in the durable queue, chunk by chunk, over hours or
// days (see lib/media/transcribe-account-job.ts for why it can't be a fan-out).
//
// There is no separate allowance here on purpose: every reel this run
// transcribes already passes the same hourly throttle and monthly plan quota as
// the per-reel button, so the cost is metered where it is actually spent.
// Charging again for pressing "start" would bill the user twice for one reel.
export const runtime = "nodejs";

type Body = { account_id?: string };

async function loadAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string
) {
  // RLS scopes this to the caller, so a foreign account id simply isn't found.
  const { data } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!transcriptionConfigured()) {
    return NextResponse.json(
      { error: "Transcription isn't set up on the server yet." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (typeof body.account_id !== "string" || !body.account_id) {
    return NextResponse.json({ error: "account_id is required." }, { status: 400 });
  }

  const account = await loadAccount(supabase, user.id, body.account_id);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  const status = await readTranscribeAccountStatus(admin, user.id, account.id);

  // Nothing to do — say so plainly rather than queueing a job that would wake,
  // find an empty candidate list, and complete.
  if (status.remaining === 0) {
    return NextResponse.json({ status: "nothing_to_do", progress: status });
  }

  const { skipped } = await enqueueJob(admin, {
    kind: "transcribe_account",
    payload: { account_id: account.id, user_id: user.id },
    userId: user.id,
    dedupKey: transcribeAccountDedupKey(account.id),
    maxAttempts: 25,
  });

  // Nudge the worker so the first chunk starts in seconds rather than on the
  // next cron tick. Best-effort; the schedule is the safety net.
  if (!skipped && process.env.CRON_SECRET) {
    after(async () => {
      try {
        await fetch(new URL("/api/cron/run-jobs", request.url), {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
      } catch {
        // Best-effort; the scheduled run-jobs cron will drain the queue.
      }
    });
  }

  await track(user.id, "transcribe_account_requested", {
    username: account.ig_username,
    account_id: account.id,
    remaining: status.remaining,
    alreadyRunning: skipped,
  });

  return NextResponse.json({
    status: skipped ? "running" : "queued",
    username: account.ig_username,
    progress: status,
  });
}

// Progress for one account. Polled by the accounts page while a run is active.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = new URL(request.url).searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required." }, { status: 400 });
  }

  const account = await loadAccount(supabase, user.id, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const admin = createAdminClient();
  return NextResponse.json({
    progress: await readTranscribeAccountStatus(admin, user.id, account.id),
  });
}
