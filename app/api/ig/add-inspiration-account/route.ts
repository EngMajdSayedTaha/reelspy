import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidIgUsername } from "@/lib/instagram/graph-api";

const bodySchema = z.object({
  username: z.string().max(30),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const clean = parsed.data.username.trim().replace(/^@+/, "").toLowerCase();

  if (!clean || !isValidIgUsername(clean)) {
    return NextResponse.json({ error: "Invalid Instagram username." }, { status: 400 });
  }

  const { error } = await supabase.from("inspiration_accounts").upsert(
    {
      user_id: user.id,
      ig_username: clean,
      display_name: clean,
      is_active: true,
    },
    { onConflict: "user_id,ig_username" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/accounts");

  return NextResponse.json({ ok: true });
}
