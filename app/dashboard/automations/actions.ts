"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTier } from "@/lib/ai/tier";
import type { AiTier } from "@/lib/ai/tier";
import { limitFor, withinLimit } from "@/lib/billing/entitlements";
import { isAdminUser } from "@/lib/billing/admin";
import { getPageCredentials, markWebhookSubscribed } from "@/lib/instagram/token-store";
import {
  getPageSubscribedFields,
  subscribePageToWebhooks,
} from "@/lib/auto-reply/graph-calls";
import type { MatchMode } from "@/lib/auto-reply/types";
import { PREFS_COOKIE, parsePrefs } from "@/lib/prefs";
import { getDictionary } from "@/lib/i18n/dictionaries";

async function getAutomationsDict() {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale).automations;
}

async function planName(tier: AiTier): Promise<string> {
  const { locale } = parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
  return getDictionary(locale).billing.plans[tier].name;
}

type ActionState = { error?: string };

const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 60;
const MAX_TEMPLATES = 5;
// Public comments cap well below this; private reply text must stay under
// Meta's 1000-char message limit even after the link is appended.
const MAX_TEMPLATE_LENGTH = 280;
const MAX_DM_LENGTH = 900;

type ParsedAutomation = {
  keywords: string[];
  match_mode: MatchMode;
  public_reply_templates: string[];
  dm_message: string;
  dm_link: string | null;
};

// Shared validation for create + update. Returns the row fields or an error.
async function parseAutomationFields(
  formData: FormData
): Promise<ParsedAutomation | { error: string }> {
  const dict = await getAutomationsDict();
  const modeRaw = formData.get("match_mode");
  const match_mode: MatchMode =
    modeRaw === "exact" ? "exact" : modeRaw === "any" ? "any" : "contains";

  // "any" mode triggers on every comment — keywords are ignored and stored empty.
  const keywordsRaw = formData.get("keywords");
  const keywords =
    match_mode === "any"
      ? []
      : Array.from(
          new Set(
            (typeof keywordsRaw === "string" ? keywordsRaw : "")
              .split(/[,\n]+/)
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean)
          )
        );

  if (match_mode !== "any") {
    if (keywords.length === 0) {
      return { error: dict.errors.keywordRequired };
    }
    if (keywords.length > MAX_KEYWORDS) {
      return { error: dict.errors.keywordsMaxPerReel(MAX_KEYWORDS) };
    }
    if (keywords.some((k) => k.length > MAX_KEYWORD_LENGTH)) {
      return { error: dict.errors.keywordsMaxLength(MAX_KEYWORD_LENGTH) };
    }
  }

  const templatesRaw = formData.get("public_reply_templates");
  const public_reply_templates =
    typeof templatesRaw === "string"
      ? templatesRaw
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, MAX_TEMPLATES)
      : [];
  if (public_reply_templates.length === 0) {
    public_reply_templates.push(dict.form.defaultTemplate);
  }
  if (public_reply_templates.some((t) => t.length > MAX_TEMPLATE_LENGTH)) {
    return { error: dict.errors.templatesMaxLength(MAX_TEMPLATE_LENGTH) };
  }

  const dmRaw = formData.get("dm_message");
  const dm_message = typeof dmRaw === "string" ? dmRaw.trim() : "";
  if (!dm_message) {
    return { error: dict.errors.dmMessageRequired };
  }
  if (dm_message.length > MAX_DM_LENGTH) {
    return { error: dict.errors.dmMessageMaxLength(MAX_DM_LENGTH) };
  }

  const linkRaw = formData.get("dm_link");
  let dm_link: string | null = null;
  if (typeof linkRaw === "string" && linkRaw.trim()) {
    try {
      const parsed = new URL(linkRaw.trim());
      if (parsed.protocol !== "https:") {
        return { error: dict.errors.linkMustBeHttps };
      }
      dm_link = parsed.toString();
    } catch {
      return { error: dict.errors.linkInvalid };
    }
  }

  return { keywords, match_mode, public_reply_templates, dm_message, dm_link };
}

export async function createAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const mediaId = formData.get("ig_media_id");
  if (typeof mediaId !== "string" || !mediaId.trim()) {
    return { error: dict.errors.reelRequired };
  }

  // Plan limit (L6): auto-reply automations are gated per tier (Free gets 0, so
  // this is also the free→paid gate for the whole module).
  const tier = await resolveUserTier(supabase, user.id);
  const { count } = await supabase
    .from("reel_automations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!(await isAdminUser(supabase, user.id)) && !withinLimit(tier, "automations", count ?? 0)) {
    const cap = limitFor(tier, "automations");
    const name = await planName(tier);
    return {
      error: cap === 0 ? dict.errors.planCapZero(name) : dict.errors.planCapReached(cap, name),
    };
  }

  const parsed = await parseAutomationFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const caption = formData.get("media_caption");
  const permalink = formData.get("media_permalink");
  const thumbnail = formData.get("media_thumbnail_url");

  const { error } = await supabase.from("reel_automations").insert({
    user_id: user.id,
    ig_media_id: mediaId.trim(),
    media_caption: typeof caption === "string" && caption ? caption.slice(0, 300) : null,
    media_permalink: typeof permalink === "string" && permalink ? permalink : null,
    media_thumbnail_url: typeof thumbnail === "string" && thumbnail ? thumbnail : null,
    ...parsed,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: dict.errors.reelAlreadyAutomated };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

export async function updateAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const automationId = formData.get("automation_id");
  if (typeof automationId !== "string" || !automationId) {
    return { error: dict.errors.automationIdRequired };
  }

  const parsed = await parseAutomationFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { error } = await supabase
    .from("reel_automations")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

// ── DM webhook re-subscription / diagnostics ──────────────────────────────────

export type ResubscribeResult = { error?: string; fields?: string[] };

// Re-run the page-level webhook subscription (feed,messages) WITHOUT a full
// Instagram reconnect — fixes the common case where a user connected before DM
// auto-reply existed and is subscribed only to `feed`. Reads the fields back so
// the UI can confirm `messages` is now active.
export async function resubscribeWebhooks(): Promise<ResubscribeResult> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const admin = createAdminClient();
  const page = await getPageCredentials(admin, user.id).catch(() => null);
  if (!page) {
    return { error: dict.errors.noFacebookPage };
  }

  try {
    await subscribePageToWebhooks(page.pageId, page.pageToken);
    await markWebhookSubscribed(admin, user.id);
    const fields = await getPageSubscribedFields(page.pageId, page.pageToken);
    revalidatePath("/dashboard/automations");
    return { fields };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message.slice(0, 300) };
  }
}

// ── DM keyword automations ────────────────────────────────────────────────────

type ParsedDmAutomation = {
  keywords: string[];
  match_mode: MatchMode;
  reply_message: string;
  reply_link: string | null;
};

async function parseDmAutomationFields(
  formData: FormData
): Promise<ParsedDmAutomation | { error: string }> {
  const dict = await getAutomationsDict();
  const modeRaw = formData.get("match_mode");
  const match_mode: MatchMode =
    modeRaw === "exact" ? "exact" : modeRaw === "any" ? "any" : "contains";

  const keywordsRaw = formData.get("keywords");
  const keywords =
    match_mode === "any"
      ? []
      : Array.from(
          new Set(
            (typeof keywordsRaw === "string" ? keywordsRaw : "")
              .split(/[,\n]+/)
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean)
          )
        );

  if (match_mode !== "any") {
    if (keywords.length === 0) {
      return { error: dict.errors.keywordRequired };
    }
    if (keywords.length > MAX_KEYWORDS) {
      return { error: dict.errors.keywordsMax(MAX_KEYWORDS) };
    }
    if (keywords.some((k) => k.length > MAX_KEYWORD_LENGTH)) {
      return { error: dict.errors.keywordsMaxLength(MAX_KEYWORD_LENGTH) };
    }
  }

  const replyRaw = formData.get("reply_message");
  const reply_message = typeof replyRaw === "string" ? replyRaw.trim() : "";
  if (!reply_message) {
    return { error: dict.errors.replyMessageRequired };
  }
  if (reply_message.length > MAX_DM_LENGTH) {
    return { error: dict.errors.replyMessageMaxLength(MAX_DM_LENGTH) };
  }

  const linkRaw = formData.get("reply_link");
  let reply_link: string | null = null;
  if (typeof linkRaw === "string" && linkRaw.trim()) {
    try {
      const parsed = new URL(linkRaw.trim());
      if (parsed.protocol !== "https:") {
        return { error: dict.errors.linkMustBeHttps };
      }
      reply_link = parsed.toString();
    } catch {
      return { error: dict.errors.linkInvalid };
    }
  }

  return { keywords, match_mode, reply_message, reply_link };
}

export async function createDmAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const parsed = await parseDmAutomationFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { error } = await supabase
    .from("dm_automations")
    .insert({ user_id: user.id, ...parsed });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

export async function updateDmAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const automationId = formData.get("automation_id");
  if (typeof automationId !== "string" || !automationId) {
    return { error: dict.errors.automationIdRequired };
  }

  const parsed = await parseDmAutomationFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { error } = await supabase
    .from("dm_automations")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

export async function toggleDmAutomationActive(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");
  const desired = formData.get("is_active");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("dm_automations")
    .update({ is_active: desired === "true", updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}

export async function deleteDmAutomation(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("dm_automations")
    .delete()
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}

export async function toggleAutomationActive(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");
  const desired = formData.get("is_active");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("reel_automations")
    .update({ is_active: desired === "true", updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}

export async function deleteAutomation(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("reel_automations")
    .delete()
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}

// ── YouTube comment automations ───────────────────────────────────────────────

type ParsedYouTubeAutomation = {
  keywords: string[];
  match_mode: MatchMode;
  public_reply_templates: string[];
};

// Accepts a full YouTube URL (watch?v=, youtu.be/, /shorts/, /live/) or a raw
// 11-char video id, and returns the bare video id.
function parseVideoId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    // youtu.be/<id>, /shorts/<id>, /live/<id>, /embed/<id>
    const candidate = parts[parts.length - 1];
    if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;
  } catch {
    return null;
  }
  return null;
}

// Shared reply-field validation for create + update (keywords, match mode,
// public reply templates). Comments-only — no DM fields.
async function parseYouTubeReplyFields(
  formData: FormData
): Promise<ParsedYouTubeAutomation | { error: string }> {
  const dict = await getAutomationsDict();
  const modeRaw = formData.get("match_mode");
  const match_mode: MatchMode =
    modeRaw === "exact" ? "exact" : modeRaw === "any" ? "any" : "contains";

  const keywordsRaw = formData.get("keywords");
  const keywords =
    match_mode === "any"
      ? []
      : Array.from(
          new Set(
            (typeof keywordsRaw === "string" ? keywordsRaw : "")
              .split(/[,\n]+/)
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean)
          )
        );

  if (match_mode !== "any") {
    if (keywords.length === 0) {
      return { error: dict.errors.keywordRequired };
    }
    if (keywords.length > MAX_KEYWORDS) {
      return { error: dict.errors.keywordsMaxPerVideo(MAX_KEYWORDS) };
    }
    if (keywords.some((k) => k.length > MAX_KEYWORD_LENGTH)) {
      return { error: dict.errors.keywordsMaxLength(MAX_KEYWORD_LENGTH) };
    }
  }

  const templatesRaw = formData.get("public_reply_templates");
  const public_reply_templates =
    typeof templatesRaw === "string"
      ? templatesRaw
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, MAX_TEMPLATES)
      : [];
  if (public_reply_templates.length === 0) {
    return { error: dict.errors.publicReplyRequired };
  }
  if (public_reply_templates.some((t) => t.length > MAX_TEMPLATE_LENGTH)) {
    return { error: dict.errors.ytTemplatesMaxLength(MAX_TEMPLATE_LENGTH) };
  }

  return { keywords, match_mode, public_reply_templates };
}

export async function createYouTubeAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const videoRaw = formData.get("video_id");
  const video_id = typeof videoRaw === "string" ? parseVideoId(videoRaw) : null;
  if (!video_id) {
    return { error: dict.errors.invalidVideoId };
  }

  const parsed = await parseYouTubeReplyFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  // Link the automation to the active YouTube connection so a disconnect is
  // visible. Token columns are server-only, but the row id is owner-readable.
  const { data: connection } = await supabase
    .from("social_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) {
    return { error: dict.errors.connectYoutubeFirst };
  }

  const titleRaw = formData.get("video_title");
  const video_title =
    typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim().slice(0, 300) : null;

  const { error } = await supabase.from("youtube_automations").insert({
    user_id: user.id,
    connection_id: connection.id,
    video_id,
    video_title,
    ...parsed,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: dict.errors.videoAlreadyAutomated };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

export async function updateYouTubeAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: dict.errors.unauthorized };
  }

  const automationId = formData.get("automation_id");
  if (typeof automationId !== "string" || !automationId) {
    return { error: dict.errors.automationIdRequired };
  }

  const parsed = await parseYouTubeReplyFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { error } = await supabase
    .from("youtube_automations")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/automations");
  return {};
}

export async function toggleYouTubeAutomationActive(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");
  const desired = formData.get("is_active");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("youtube_automations")
    .update({ is_active: desired === "true", updated_at: new Date().toISOString() })
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}

export async function deleteYouTubeAutomation(formData: FormData) {
  const dict = await getAutomationsDict();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(dict.errors.unauthorized);
  }

  const automationId = formData.get("automation_id");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error(dict.errors.automationIdRequired);
  }

  const { error } = await supabase
    .from("youtube_automations")
    .delete()
    .eq("id", automationId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/automations");
}
