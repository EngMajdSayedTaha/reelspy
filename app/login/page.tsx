"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const queryErrorMap: Record<string, string> = {
  missing_code: "Missing OAuth code. Please try signing in again.",
  oauth_exchange_failed: "Google sign in failed. Please try again.",
  user_not_found: "Could not load your user profile. Please retry.",
  schema_missing: "Supabase schema is missing. Run supabase/schema.sql in SQL Editor.",
  profile_upsert_failed: "Could not create your profile. Please retry.",
  supabase_env_missing: "Supabase environment variables are missing.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const authError = searchParams.get("error");
  const authReason = searchParams.get("reason");
  const baseQueryError = authError ? queryErrorMap[authError] ?? null : null;
  const queryError = baseQueryError
    ? authReason
      ? `${baseQueryError} (${authReason})`
      : baseQueryError
    : null;

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0d0d] p-6">
      {/* Ambient accent glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-[#F9E400]/5 blur-[120px]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark size={48} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Reel<span className="text-[#F9E400]">Spy</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Personal content intelligence</p>
          </div>
        </div>

        <Card className="border-[#1f1f1f] bg-[#111111] text-zinc-100">
          <CardContent className="space-y-4 pt-6">
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
    </div>
  );
}
