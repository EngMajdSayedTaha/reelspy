import { createBrowserClient } from "@supabase/ssr";
import { authCookieOptions } from "./cookie-options";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Persist the session in long-lived cookies (see cookie-options.ts) so a
      // phone does not silently lose it after a deploy cycle.
      cookieOptions: authCookieOptions,
      auth: {
        // Keep the session in storage and silently refresh the access token
        // while the tab is alive. PKCE is the flow the /auth/callback route
        // exchanges, and detectSessionInUrl lets the client finish OAuth if it
        // ever lands back in the browser instead of the server route.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    }
  );
}
