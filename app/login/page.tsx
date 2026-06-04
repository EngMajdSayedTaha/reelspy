"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const queryErrorMap: Record<string, string> = {
    missing_code: "Missing OAuth code. Please try signing in again.",
    oauth_exchange_failed: "Google sign in failed. Please try again.",
    user_not_found: "Could not load your user profile. Please retry.",
    schema_missing: "Supabase schema is missing. Run supabase/schema.sql in SQL Editor.",
    profile_upsert_failed: "Could not create your profile. Please retry.",
    supabase_env_missing: "Supabase environment variables are missing.",
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    const mapped = authError ? queryErrorMap[authError] : null;
    setQueryError(mapped ?? null);
  }, []);

  const handleOAuth = async () => {
    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are missing.");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (mode: "signin" | "signup") => {
    if (!isSupabaseConfigured) {
      setError("Supabase environment variables are missing.");
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const action =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error: authError } = await action;

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    if (mode === "signin") {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError("Signup successful. Check your email to verify your account.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] p-6">
      <Card className="w-full max-w-md border-[#1f1f1f] bg-[#111111] text-zinc-100">
        <CardHeader>
          <CardTitle className="text-center text-3xl font-semibold tracking-tight text-[#F9E400]">
            ReelSpy
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={handleOAuth}
            disabled={isLoading || !isSupabaseConfigured}
            type="button"
          >
            Continue with Google
          </Button>

          <div className="text-center text-xs uppercase tracking-wide text-zinc-400">or</div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void handleEmailAuth("signin")}
              disabled={isLoading || !isSupabaseConfigured || !email || !password}
              type="button"
            >
              Sign In
            </Button>
            <Button
              className="flex-1"
              onClick={() => void handleEmailAuth("signup")}
              disabled={isLoading || !isSupabaseConfigured || !email || !password}
              type="button"
              variant="outline"
            >
              Sign Up
            </Button>
          </div>

          {!isSupabaseConfigured ? (
            <p className="text-sm text-amber-400">
              Fill Supabase values in .env.local before authentication.
            </p>
          ) : null}

          {error || queryError ? (
            <p className="text-sm text-rose-400">{error ?? queryError}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
