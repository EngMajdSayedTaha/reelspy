"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useDict } from "@/lib/i18n/I18nProvider";

export function SignOutButton() {
  const router = useRouter();
  const dict = useDict();

  const handleSignOut = async () => {
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
