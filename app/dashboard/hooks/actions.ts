"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Persistent hook library (W4/V1). All writes go through the user-scoped client
// so RLS enforces ownership — no admin client needed.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

// Normalize a tag: lowercase, trimmed, spaces→hyphens, capped. Keeps the tag
// vocabulary tidy so "Lead Gen" and "lead-gen" don't fragment the filter chips.
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
}

function cleanTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const n = normalizeTag(t);
    if (n) seen.add(n);
  }
  return [...seen].slice(0, 12); // cap tags per hook
}

const saveSchema = z.object({
  text: z.string().trim().min(1, "Hook text is required.").max(500),
  reelId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  source: z.enum(["transcript", "manual"]).default("manual"),
});

export type SaveHookInput = z.input<typeof saveSchema>;

// Save a hook. Idempotent on (user_id, text): re-saving the same text just
// refreshes its tags rather than erroring on the unique constraint.
export async function saveHook(input: SaveHookInput): Promise<{ id: string }> {
  const parsed = saveSchema.parse(input);
  const { supabase, user } = await requireUser();

  const row = {
    user_id: user.id,
    text: parsed.text,
    reel_id: parsed.reelId ?? null,
    tags: cleanTags(parsed.tags),
    source: parsed.source,
  };

  const { data, error } = await supabase
    .from("saved_hooks")
    .upsert(row, { onConflict: "user_id,text" })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not save the hook.");

  revalidatePath("/dashboard/hooks");
  return { id: data.id as string };
}

export async function deleteHook(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("saved_hooks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/hooks");
}

const tagsSchema = z.object({
  id: z.string().uuid(),
  tags: z.array(z.string()),
});

export async function setHookTags(input: z.input<typeof tagsSchema>): Promise<void> {
  const parsed = tagsSchema.parse(input);
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("saved_hooks")
    .update({ tags: cleanTags(parsed.tags) })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/hooks");
}
