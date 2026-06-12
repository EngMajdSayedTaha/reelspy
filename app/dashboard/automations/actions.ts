"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MatchMode } from "@/lib/auto-reply/types";

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
function parseAutomationFields(formData: FormData): ParsedAutomation | { error: string } {
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
      return { error: "At least one keyword is required." };
    }
    if (keywords.length > MAX_KEYWORDS) {
      return { error: `Use up to ${MAX_KEYWORDS} keywords per reel.` };
    }
    if (keywords.some((k) => k.length > MAX_KEYWORD_LENGTH)) {
      return { error: `Keywords must be ${MAX_KEYWORD_LENGTH} characters or fewer.` };
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
    public_reply_templates.push("Check your DMs 📩");
  }
  if (public_reply_templates.some((t) => t.length > MAX_TEMPLATE_LENGTH)) {
    return { error: `Public replies must be ${MAX_TEMPLATE_LENGTH} characters or fewer.` };
  }

  const dmRaw = formData.get("dm_message");
  const dm_message = typeof dmRaw === "string" ? dmRaw.trim() : "";
  if (!dm_message) {
    return { error: "The DM message is required." };
  }
  if (dm_message.length > MAX_DM_LENGTH) {
    return { error: `The DM message must be ${MAX_DM_LENGTH} characters or fewer.` };
  }

  const linkRaw = formData.get("dm_link");
  let dm_link: string | null = null;
  if (typeof linkRaw === "string" && linkRaw.trim()) {
    try {
      const parsed = new URL(linkRaw.trim());
      if (parsed.protocol !== "https:") {
        return { error: "The link must start with https://." };
      }
      dm_link = parsed.toString();
    } catch {
      return { error: "That doesn't look like a valid link." };
    }
  }

  return { keywords, match_mode, public_reply_templates, dm_message, dm_link };
}

export async function createAutomation(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const mediaId = formData.get("ig_media_id");
  if (typeof mediaId !== "string" || !mediaId.trim()) {
    return { error: "Pick one of your reels first." };
  }

  const parsed = parseAutomationFields(formData);
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
      return { error: "This reel already has an automation — edit it instead." };
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized." };
  }

  const automationId = formData.get("automation_id");
  if (typeof automationId !== "string" || !automationId) {
    return { error: "Automation id is required." };
  }

  const parsed = parseAutomationFields(formData);
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

export async function toggleAutomationActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const automationId = formData.get("automation_id");
  const desired = formData.get("is_active");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error("Automation id is required.");
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const automationId = formData.get("automation_id");

  if (typeof automationId !== "string" || !automationId) {
    throw new Error("Automation id is required.");
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
