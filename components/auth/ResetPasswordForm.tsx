"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";
import { mapAuthError } from "@/lib/auth/errors";
import { validatePassword, describePasswordIssues } from "@/lib/auth/password";
import { requestJson, notifyError } from "@/lib/utils/api";

// `forced` distinguishes an admin-forced reset (middleware.ts redirected a
// signed-in user here because profiles.force_password_reset is true) from a
// voluntary one via a recovery link. In the forced case, a successful password
// update must also clear that flag server-side (own session only — see
// app/api/auth/clear-forced-reset) before the dashboard gate will let them
// back in; that call is separated from the password update itself so a
// transient failure never strands the user re-submitting a password GoTrue
// will reject as unchanged.
export function ResetPasswordForm({ forced = false }: { forced?: boolean } = {}) {
  const router = useRouter();
  const dict = useDict();
  const auth = dict.auth;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsFlagRetry, setNeedsFlagRetry] = useState(false);

  const finishForcedReset = async () => {
    setIsLoading(true);
    try {
      await requestJson("/api/auth/clear-forced-reset", { method: "POST" });
    } catch (err) {
      notifyError(err, auth.forcedResetRetryNotice);
      setNeedsFlagRetry(true);
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut({ scope: "others" });
    router.push("/dashboard");
    router.refresh();
  };

  const handleSubmit = async () => {
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      setError(describePasswordIssues(passwordCheck.issues, auth.validation).join(" "));
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

    if (forced) {
      await finishForcedReset();
      return;
    }

    // Password changed — kill every other session (e.g. a device that stole the
    // old password) while keeping this one signed in.
    await supabase.auth.signOut({ scope: "others" });

    router.push("/dashboard");
    router.refresh();
  };

  if (needsFlagRetry) {
    return (
      <>
        <h2 className="text-lg font-semibold text-foreground">{auth.resetPasswordHeading}</h2>
        <p className="text-sm text-subtle">{auth.forcedResetRetryNotice}</p>
        <Button className="w-full" onClick={() => void finishForcedReset()} disabled={isLoading} type="button">
          {auth.forcedResetRetryButton}
        </Button>
      </>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground">{auth.resetPasswordHeading}</h2>
      <p className="text-sm text-subtle">{forced ? auth.forcedResetNotice : auth.resetPasswordDescription}</p>

      <div className="space-y-2">
        <Label htmlFor="new-password">{auth.newPasswordLabel}</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-subtle">{auth.validation.passwordRequirement}</p>
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
