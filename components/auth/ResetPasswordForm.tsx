"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const dict = useDict();
  const auth = dict.auth;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(auth.validation.passwordTooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(auth.validation.passwordsDontMatch);
      return;
    }

    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(mapAuthError(updateError, auth.authErrors));
      setIsLoading(false);
      return;
    }

    // Password changed — kill every other session (e.g. a device that stole the
    // old password) while keeping this one signed in.
    await supabase.auth.signOut({ scope: "others" });

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground">{auth.resetPasswordHeading}</h2>
      <p className="text-sm text-subtle">{auth.resetPasswordDescription}</p>

      <div className="space-y-2">
        <Label htmlFor="new-password">{auth.newPasswordLabel}</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">{auth.confirmPasswordLabel}</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      <Button
        className="w-full"
        onClick={() => void handleSubmit()}
        disabled={isLoading || !password || !confirmPassword}
        type="button"
      >
        {auth.resetPasswordButton}
      </Button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </>
  );
}
