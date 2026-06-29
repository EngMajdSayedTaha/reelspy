import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "./cookie-options";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // Merge our persistence defaults under whatever Supabase passes so
              // the durable maxAge survives even on Supabase's own cookie writes.
              cookieStore.set(name, value, { ...authCookieOptions, ...options })
            );
          } catch {
            // no-op when called from a Server Component
          }
        },
      },
    }
  );
}
