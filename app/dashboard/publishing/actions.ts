"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/queue";
import { deleteR2Object } from "@/lib/storage/r2";
import { getConnection } from "@/lib/publishing/token-store";
import { getIgCredentials, getPageCredentials } from "@/lib/instagram/token-store";
import { listPublishMediaPaths } from "@/lib/publishing/media";
import { kickPublishWorker } from "@/lib/publishing/kick";
import { PLATFORMS, isOAuthPlatform, type Platform } from "@/lib/publishing/types";
import { readPlatformsFlag } from "@/lib/publishing/platforms-flag";
import { mediaKindFor } from "@/lib/publishing/capabilities";
import { validateDraft, type Issue } from "@/lib/publishing/validate";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { PublishingDict } from "@/lib/i18n/dictionaries/publishing";

async function getDict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale);
}

const tiktokOptionsSchema = z.object({
  privacyLevel: z.enum([
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
  ]),
  postMode: z.enum(["direct", "draft"]),
  brandedContent: z.boolean(),
  brandOrganic: z.boolean(),
  autoAddMusic: z.boolean().optional(),
});

const mediaItemSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  bytes: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  altText: z.string().max(1000).nullable().optional(),
});

// Built per-call (not module scope) so the "pick at least one platform" message
// reflects the caller's locale cookie.
function createSchema(t: PublishingDict["publishing"]) {
  return z.object({
    // Ordered slides. One = a single image or video post; more = a carousel.
    media: z.array(mediaItemSchema).min(1, t.chooseMediaFirst).max(35),
    title: z.string().max(200).optional().nullable(),
    caption: z.string().max(5000).optional().nullable(),
    hashtags: z.string().max(2000).optional().nullable(),
    platforms: z.array(z.enum(PLATFORMS)).min(1, t.pickAtLeastOnePlatform),
    // Optional per-platform caption overrides, keyed by platform. A platform with
    // a non-empty value here posts that caption instead of the shared one; anything
    // absent or blank falls back to `caption` at dispatch time.
    captions: z.record(z.string(), z.string().max(5000)).optional(),
    privacy: z.enum(["public", "private"]).default("public"),
    // Carousel slide used as the cover (TikTok photo_cover_index).
    coverIndex: z.number().int().nonnegative().default(0),
    // Video frame (ms) used as the cover (Instagram thumb_offset).
    coverMs: z.number().int().nonnegative().nullable().optional(),
    // ISO datetime; absent/empty = publish now.
    scheduledAt: z.string().datetime().optional().nullable(),
    // TikTok compliance-panel choices (T4) — required client-side whenever
    // TikTok is a selected target; absent for every other platform.
    tiktokOptions: tiktokOptionsSchema.optional(),
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

/** Turn the validator's first blocking issue into the thrown user-facing error. */
function issueMessage(t: PublishingDict["publishing"], issue: Issue): string {
  return t.validation.message(issue);
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

  // Authoritative platform gate: even a stale/cached client can't queue a job
  // for a platform the founder turned off (flag:platforms) or the user hasn't
  // actually connected.
  const platformsFlag = await readPlatformsFlag(admin);
  const targets: Platform[] = [];
  for (const platform of parsed.platforms) {
    if (platformsFlag[platform] && (await isConnected(admin, user.id, platform))) targets.push(platform);
  }
  if (targets.length === 0) {
    throw new Error(t.noPlatformsConnected);
  }

  // Re-run the exact validation the composer ran. The composer's copy is a
  // convenience for the user; this one is the guarantee — a stale tab or a
  // hand-rolled request must not be able to queue a job only the platform can
  // reject (an 11-slide Instagram carousel, a photo aimed at YouTube, a caption
  // 400 characters over Threads' limit).
  const { errors } = validateDraft(
    {
      media: parsed.media.map((item) => ({
        kind: item.kind,
        mimeType: item.mimeType,
        bytes: item.bytes ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        durationSeconds: item.durationSeconds ?? null,
        altText: item.altText ?? null,
      })),
      platforms: targets,
      title: parsed.title ?? "",
      caption: parsed.caption ?? "",
      hashtags: parsed.hashtags ?? "",
      captions: parsed.captions as Partial<Record<Platform, string>> | undefined,
      scheduledAt: parsed.scheduledAt ?? null,
    },
    Date.now()
  );
  if (errors.length > 0) throw new Error(issueMessage(t, errors[0]));

  // TikTok rejects branded/paid-partnership content posted as SELF_ONLY — the
  // disclosure has to reach an audience. Reject early with a clear message
  // instead of letting the client-side gate be the only thing enforcing it.
  if (
    targets.includes("tiktok") &&
    parsed.tiktokOptions?.brandedContent &&
    parsed.tiktokOptions.privacyLevel === "SELF_ONLY"
  ) {
    throw new Error(t.tiktokBrandedPrivacyConflict);
  }

  const immediate = !parsed.scheduledAt;
  const mediaKind = mediaKindFor(parsed.media);
  const coverIndex = Math.min(Math.max(parsed.coverIndex, 0), parsed.media.length - 1);

  const { data: post, error: postErr } = await admin
    .from("publish_posts")
    .insert({
      user_id: user.id,
      title: parsed.title ?? null,
      caption: parsed.caption ?? null,
      hashtags: parsed.hashtags ?? null,
      // Kept in sync for the single-video case so anything still reading the
      // legacy column (and the media loader's fallback) resolves.
      video_path: mediaKind === "video" ? parsed.media[0].path : null,
      media_kind: mediaKind,
      cover_index: coverIndex,
      cover_ms: parsed.coverMs ?? null,
      duration_seconds: parsed.media[0].durationSeconds
        ? Math.round(parsed.media[0].durationSeconds)
        : null,
      status: immediate ? "publishing" : "scheduled",
      scheduled_at: parsed.scheduledAt ?? null,
    })
    .select("id")
    .single();

  if (postErr || !post) throw new Error(postErr?.message ?? t.couldNotCreatePost);

  const { error: mediaErr } = await admin.from("publish_media").insert(
    parsed.media.map((item, index) => ({
      post_id: post.id,
      user_id: user.id,
      position: index,
      kind: item.kind,
      storage_path: item.path,
      mime_type: item.mimeType,
      byte_size: item.bytes ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      duration_seconds: item.durationSeconds ?? null,
      alt_text: item.altText?.trim() || null,
    }))
  );
  if (mediaErr) {
    // The post row without its media is unpublishable and would sit in the
    // history as a permanent failure — take it back out.
    await admin.from("publish_posts").delete().eq("id", post.id);
    throw new Error(mediaErr.message);
  }

  // One job per connected target. connection_id is the social_connections row
  // for TikTok/YouTube/Threads; IG/FB credentials live on the profile, so it
  // stays null.
  const jobRows = [] as Array<Record<string, unknown>>;
  for (const platform of targets) {
    const conn = isOAuthPlatform(platform)
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
      platform_options: platform === "tiktok" ? parsed.tiktokOptions ?? null : null,
    });
  }

  const { error: jobsErr } = await admin.from("publish_jobs").insert(jobRows);
  if (jobsErr) throw new Error(jobsErr.message);

  // Everything goes through the durable queue — "post now" included. The
  // dispatcher can spend minutes per platform (Instagram polls its container, a
  // carousel is a dozen round-trips, YouTube streams the file), which is far
  // longer than a server action should hold a response open.
  await enqueueJob(admin, {
    kind: "publish_post",
    payload: { post_id: post.id },
    userId: user.id,
    runAt: parsed.scheduledAt ?? undefined,
    dedupKey: `publish:${post.id}`,
  });

  // For an immediate post, poke the worker so it starts within a second instead
  // of waiting for the next cron tick. Runs after the response is sent.
  if (immediate) kickPublishWorker(post.id);

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

  await syncQueuedPublishJob(admin, user.id, parsed.postId, parsed.scheduledAt);

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

  await syncQueuedPublishJob(admin, user.id, parsed.postId, parsed.scheduledAt);

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
}

// Keep the durable publish job's fire time in sync with the post's schedule.
// Update the still-queued job in place; if none exists (e.g. a post scheduled
// before the queue), enqueue one.
async function syncQueuedPublishJob(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  postId: string,
  scheduledAt: string
): Promise<void> {
  const { data: bumped } = await admin
    .from("jobs")
    .update({ run_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq("dedup_key", `publish:${postId}`)
    .eq("status", "queued")
    .select("id");
  if (!bumped || bumped.length === 0) {
    await enqueueJob(admin, {
      kind: "publish_post",
      payload: { post_id: postId },
      userId,
      runAt: scheduledAt,
      dedupKey: `publish:${postId}`,
    });
  }
}

export async function retryJob(jobId: string): Promise<void> {
  const dict = await getDict();
  const t = dict.publishing;
  const user = await requireUser(t);
  const admin = createAdminClient();

  // Reset to pending (the post_id+platform unique index is the idempotency
  // lock), then queue the parent post's dispatcher — never run it inline.
  const { data: job } = await admin
    .from("publish_jobs")
    .select("id, post_id, user_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.user_id !== user.id) throw new Error(t.jobNotFound);

  await admin
    .from("publish_jobs")
    .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  await admin
    .from("publish_posts")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", job.post_id);

  await enqueueJob(admin, {
    kind: "publish_post",
    payload: { post_id: job.post_id },
    userId: user.id,
    dedupKey: `publish:${job.post_id}`,
  });
  kickPublishWorker(job.post_id);

  revalidatePath("/dashboard/publishing");
}

/**
 * Clone a post's copy and media into a fresh draft, ready to re-target and
 * re-schedule. The media rows point at the SAME R2 objects — nothing is
 * re-uploaded, and deleting the copy leaves the original's media alone because
 * deletePost only removes objects the post still owns (see below).
 */
export async function duplicatePost(postId: string): Promise<{ postId: string }> {
  const dict = await getDict();
  const t = dict.publishing;
  const user = await requireUser(t);
  const admin = createAdminClient();

  const { data: source } = await admin
    .from("publish_posts")
    .select("id, user_id, title, caption, hashtags, video_path, media_kind, cover_index, cover_ms, duration_seconds")
    .eq("id", postId)
    .maybeSingle();
  if (!source || source.user_id !== user.id) throw new Error(t.postNotFound);

  const { data: copy, error: copyErr } = await admin
    .from("publish_posts")
    .insert({
      user_id: user.id,
      title: source.title,
      caption: source.caption,
      hashtags: source.hashtags,
      video_path: source.video_path,
      media_kind: source.media_kind ?? "video",
      cover_index: source.cover_index ?? 0,
      cover_ms: source.cover_ms,
      duration_seconds: source.duration_seconds,
      status: "draft",
      scheduled_at: null,
    })
    .select("id")
    .single();
  if (copyErr || !copy) throw new Error(copyErr?.message ?? t.couldNotCreatePost);

  const { data: media } = await admin
    .from("publish_media")
    .select("position, kind, storage_path, mime_type, byte_size, width, height, duration_seconds, alt_text")
    .eq("post_id", postId)
    .order("position", { ascending: true });

  if (media && media.length > 0) {
    await admin
      .from("publish_media")
      .insert(media.map((row) => ({ ...row, post_id: copy.id, user_id: user.id })));
  }

  revalidatePath("/dashboard/publishing");
  return { postId: copy.id };
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

  // Remove the R2 objects too — every slide, not just the legacy video column.
  // Objects shared with another post (a duplicate) are left alone, otherwise
  // deleting a copy would blank the original.
  const paths = await listPublishMediaPaths(admin, postId, post.video_path);
  const shared = new Set<string>();
  if (paths.length > 0) {
    const { data: others } = await admin
      .from("publish_media")
      .select("storage_path")
      .in("storage_path", paths)
      .neq("post_id", postId)
      .returns<{ storage_path: string }[]>();
    for (const row of others ?? []) shared.add(row.storage_path);
  }

  for (const path of paths) {
    if (shared.has(path)) continue;
    try {
      await deleteR2Object(path);
    } catch {
      // Don't block post deletion if the object is already gone / R2 hiccups.
    }
  }

  // publish_media and publish_jobs cascade from the post row.
  await admin.from("publish_posts").delete().eq("id", postId);

  revalidatePath("/dashboard/publishing");
  revalidatePath("/dashboard/calendar");
}
