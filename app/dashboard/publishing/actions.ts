"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPost } from "@/lib/publishing/dispatcher";
import { enqueueJob } from "@/lib/jobs/queue";
import { deleteR2Object } from "@/lib/storage/r2";
import { getConnection } from "@/lib/publishing/token-store";
import { getIgCredentials, getPageCredentials } from "@/lib/instagram/token-store";
import { PLATFORMS, type Platform } from "@/lib/publishing/types";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { PublishingDict } from "@/lib/i18n/dictionaries/publishing";

async function getDict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale);
}

// Built per-call (not module scope) so the "pick at least one platform" message
// reflects the caller's locale cookie.
function createSchema(t: PublishingDict["publishing"]) {
  return z.object({
    videoPath: z.string().min(1),
    title: z.string().max(200).optional().nullable(),
    caption: z.string().max(5000).optional().nullable(),
    hashtags: z.string().max(2000).optional().nullable(),
    platforms: z.array(z.enum(PLATFORMS)).min(1, t.pickAtLeastOnePlatform),
    // Optional per-platform caption overrides, keyed by platform. A platform with
    // a non-empty value here posts that caption instead of the shared one; anything
    // absent or blank falls back to `caption` at dispatch time.
    captions: z.record(z.string(), z.string().max(5000)).optional(),
    privacy: z.enum(["public", "private"]).default("public"),
    // ISO datetime; absent/empty = publish now.
    scheduledAt: z.string().datetime().optional().nullable(),
  });
}

export type CreatePostInput = z.input<ReturnType<typeof createSchema>>;

async function requireUser(t: PublishingDict["publishing"]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(t.unauthorized);
  return user;
}

// Confirms the user actually has a usable connection for a platform, so we never
// queue a job that can only fail.
async function isConnected(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  platform: Platform
): Promise<boolean> {
  if (platform === "instagram") return Boolean(await getIgCredentials(admin, userId));
  if (platform === "facebook") return Boolean(await getPageCredentials(admin, userId));
  const conn = await getConnection(admin, userId, platform);
  return Boolean(conn?.access_token && conn.token_status !== "invalid");
}

export async function createPublishPost(input: CreatePostInput): Promise<{
  postId: string;
  publishedNow: boolean;
}> {
  const dict = await getDict();
  const t = dict.publishing;
  const parsed = createSchema(t).parse(input);
  const user = await requireUser(t);
  const admin = createAdminClient();

  // Drop any platform the user hasn't connected.
  const targets: Platform[] = [];
  for (const platform of parsed.platforms) {
    if (await isConnected(admin, user.id, platform)) targets.push(platform);
  }
  if (targets.length === 0) {
    throw new Error(t.noPlatformsConnected);
  }

  const immediate = !parsed.scheduledAt;

  const { data: post, error: postErr } = await admin
    .from("publish_posts")
    .insert({
      user_id: user.id,
      title: parsed.title ?? null,
      caption: parsed.caption ?? null,
      hashtags: parsed.hashtags ?? null,
      video_path: parsed.videoPath,
      status: immediate ? "publishing" : "scheduled",
      scheduled_at: parsed.scheduledAt ?? null,
    })
    .select("id")
    .single();

  if (postErr || !post) throw new Error(postErr?.message ?? t.couldNotCreatePost);

  // One job per connected target. connection_id is the social_connections row
  // for TikTok/YouTube; IG/FB credentials live on the profile, so it stays null.
  const jobRows = [] as Array<Record<string, unknown>>;
  for (const platform of targets) {
    const conn =
      platform === "tiktok" || platform === "youtube"
        ? await getConnection(admin, user.id, platform)
        : null;
    // Per-platform override wins; blank/absent leaves caption null so the
    // dispatcher falls back to the shared post caption.
    const override = parsed.captions?.[platform]?.trim();
    jobRows.push({
      post_id: post.id,
      user_id: user.id,
      connection_id: conn?.id ?? null,
      platform,
      caption: override ? override : null,
      privacy: parsed.privacy,
      status: "pending",
    });
  }

  const { error: jobsErr } = await admin.from("publish_jobs").insert(jobRows);
  if (jobsErr) throw new Error(jobsErr.message);

  if (immediate) {
    // Run inline so the user sees results on return. Dispatcher writes per-job
    // status; we don't throw on partial failure.
    await dispatchPost(admin, post.id);
  } else {
    // Scheduled: enqueue a durable publish job that fires at the scheduled time
    // (V4). The cron worker claims it when due and runs the same dispatcher.
    await enqueueJob(admin, {
      kind: "publish_post",
      payload: { post_id: post.id },
      userId: user.id,
      runAt: parsed.scheduledAt!,
      dedupKey: `publish:${post.id}`,
    });
  }

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
  return { postId: post.id, publishedNow: immediate };
}

const updateSchema = z.object({
  postId: z.string().uuid(),
  title: z.string().max(200).optional().nullable(),
  caption: z.string().max(5000).optional().nullable(),
  hashtags: z.string().max(2000).optional().nullable(),
  // ISO datetime in UTC; the client converts from the user's local picker.
  scheduledAt: z.string().datetime(),
});

export type UpdatePostInput = z.input<typeof updateSchema>;

// Edit a still-pending scheduled post: change when it fires or tweak the copy.
// Only posts in the `scheduled` state are editable — once the cron worker has
// flipped a post to publishing/done/failed, the content is already in flight.
export async function updateScheduledPost(input: UpdatePostInput): Promise<void> {
  const dict = await getDict();
  const t = dict.publishing;
  const parsed = updateSchema.parse(input);
  const user = await requireUser(t);
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("publish_posts")
    .select("id, user_id, status")
    .eq("id", parsed.postId)
    .maybeSingle();
  if (!post || post.user_id !== user.id) throw new Error(t.postNotFound);
  if (post.status !== "scheduled") {
    throw new Error(t.onlyScheduledEditable);
  }

  const { error } = await admin
    .from("publish_posts")
    .update({
      title: parsed.title?.trim() || null,
      caption: parsed.caption?.trim() || null,
      hashtags: parsed.hashtags?.trim() || null,
      scheduled_at: parsed.scheduledAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.postId);
  if (error) throw new Error(error.message);

  // Keep the durable publish job's fire time in sync with the new schedule.
  // Update the still-queued job in place; if none exists (e.g. a post scheduled
  // before the queue), enqueue one.
  const { data: bumped } = await admin
    .from("jobs")
    .update({ run_at: parsed.scheduledAt, updated_at: new Date().toISOString() })
    .eq("dedup_key", `publish:${parsed.postId}`)
    .eq("status", "queued")
    .select("id");
  if (!bumped || bumped.length === 0) {
    await enqueueJob(admin, {
      kind: "publish_post",
      payload: { post_id: parsed.postId },
      userId: user.id,
      runAt: parsed.scheduledAt,
      dedupKey: `publish:${parsed.postId}`,
    });
  }

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
}

const rescheduleSchema = z.object({
  postId: z.string().uuid(),
  // ISO datetime in UTC; the calendar composes it from the target day + the
  // post's existing local time-of-day.
  scheduledAt: z.string().datetime(),
});

// Drag-to-reschedule from the calendar: move a still-`scheduled` post to a new
// time without touching its copy. Same job-sync discipline as
// updateScheduledPost — just the fire time changes.
export async function reschedulePost(input: {
  postId: string;
  scheduledAt: string;
}): Promise<void> {
  const dict = await getDict();
  const t = dict.publishing;
  const parsed = rescheduleSchema.parse(input);
  const user = await requireUser(t);
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("publish_posts")
    .select("id, user_id, status")
    .eq("id", parsed.postId)
    .maybeSingle();
  if (!post || post.user_id !== user.id) throw new Error(t.postNotFound);
  if (post.status !== "scheduled") {
    throw new Error(t.onlyScheduledReschedulable);
  }

  const { error } = await admin
    .from("publish_posts")
    .update({ scheduled_at: parsed.scheduledAt, updated_at: new Date().toISOString() })
    .eq("id", parsed.postId);
  if (error) throw new Error(error.message);

  // Keep the durable publish job's fire time in sync (mirror updateScheduledPost).
  const { data: bumped } = await admin
    .from("jobs")
    .update({ run_at: parsed.scheduledAt, updated_at: new Date().toISOString() })
    .eq("dedup_key", `publish:${parsed.postId}`)
    .eq("status", "queued")
    .select("id");
  if (!bumped || bumped.length === 0) {
    await enqueueJob(admin, {
      kind: "publish_post",
      payload: { post_id: parsed.postId },
      userId: user.id,
      runAt: parsed.scheduledAt,
      dedupKey: `publish:${parsed.postId}`,
    });
  }

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
}

export async function retryJob(jobId: string): Promise<void> {
  const dict = await getDict();
  const t = dict.publishing;
  const user = await requireUser(t);
  const admin = createAdminClient();

  // Reset to pending (idempotency lock lives on post_id+connection_id), then
  // re-run the parent post's dispatcher.
  const { data: job } = await admin
    .from("publish_jobs")
    .select("id, post_id, user_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.user_id !== user.id) throw new Error(t.jobNotFound);

  await admin
    .from("publish_jobs")
    .update({ status: "pending", error_message: null })
    .eq("id", jobId);

  await dispatchPost(admin, job.post_id);
  revalidatePath("/dashboard/publishing");
}

export async function deletePost(postId: string): Promise<void> {
  const dict = await getDict();
  const t = dict.publishing;
  const user = await requireUser(t);
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("publish_posts")
    .select("id, user_id, video_path")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.user_id !== user.id) throw new Error(t.postNotFound);

  // Remove the uploaded R2 object too (best-effort), then the row (jobs cascade).
  if (post.video_path) {
    try {
      await deleteR2Object(post.video_path);
    } catch {
      // Don't block post deletion if the object is already gone / R2 hiccups.
    }
  }
  await admin.from("publish_posts").delete().eq("id", postId);

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
}
