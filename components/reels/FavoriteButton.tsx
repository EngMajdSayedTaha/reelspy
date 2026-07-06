"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useDict } from "@/lib/i18n/I18nProvider";

type FavoriteButtonProps = {
  reelId: string;
  favorite: boolean;
  action: (formData: FormData) => Promise<void>;
};

// Optimistic, animated favorite toggle — the heart flips and pops instantly on
// click while the server action runs in the background, so there's no lag.
export function FavoriteButton({ reelId, favorite, action }: FavoriteButtonProps) {
  const dict = useDict().feed.favorite;
  const [fav, setFav] = useState(favorite);
  const [synced, setSynced] = useState(favorite);
  const [pop, setPop] = useState(false);
  const [, startTransition] = useTransition();

  // Reconcile with the server value once revalidation lands.
  if (favorite !== synced) {
    setSynced(favorite);
    setFav(favorite);
  }

  const toggle = () => {
    const next = !fav;
    setFav(next);
    if (next) {
      setPop(true);
      setTimeout(() => setPop(false), 350);
    }

    const data = new FormData();
    data.set("reel_id", reelId);
    data.set("favorite", next ? "true" : "false");

    startTransition(async () => {
      try {
        await action(data);
      } catch {
        setFav(!next); // revert
        toast.error(dict.updateError);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fav ? dict.removeAria : dict.addAria}
      title={fav ? dict.removeAria : dict.addAria}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/20 backdrop-blur-sm transition active:scale-90"
    >
      <Heart
        className={`h-4 w-4 transition-colors ${
          fav ? "fill-rose-500 text-rose-500" : "text-white"
        } ${pop ? "favorite-pop" : ""}`}
      />
    </button>
  );
}
