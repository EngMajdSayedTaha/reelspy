"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";

export function SignOutButton() {
  const router = useRouter();
  const dict = useDict();

  const handleSignOut = async () => {
    // End any admin elevation first. It is a separate credential with its own
    // lifetime (lib/admin/elevation.ts), so signing out would otherwise leave a
    // live, httpOnly "panel is unlocked" cookie behind in this browser — which
    // matters on a shared machine, where the next person may know the account
    // password but not the admin passphrase. A 404 here is the normal answer
    // for a non-admin; nothing about sign-out depends on the result.
    await fetch("/api/admin/security/lock", { method: "POST", keepalive: true }).catch(() => {});

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button className="w-full" variant="outline" onClick={() => void handleSignOut()} type="button">
      {dict.shell.signOut}
    </Button>
  );
}
