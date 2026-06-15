"use client";

import { useEffect, useState, useTransition } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/utils/api";

type ActionState = { error?: string };
type ActionFn = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type MyReel = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
};

type MyReelsResponse = {
  connected: boolean;
  media?: MyReel[];
};

type AutomationFormProps = {
  action: ActionFn;
  /** Reels that already have an automation — hidden from the picker. */
  automatedMediaIds: string[];
};

function reelLabel(reel: MyReel): string {
  const date = reel.timestamp
    ? new Date(reel.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const caption = (reel.caption ?? "").replace(/\s+/g, " ").trim();
  const snippet = caption ? caption.slice(0, 60) + (caption.length > 60 ? "…" : "") : "(no caption)";
  return date ? `${date} — ${snippet}` : snippet;
}

export function AutomationForm({ action, automatedMediaIds }: AutomationFormProps) {
  const [reels, setReels] = useState<MyReel[]>([]);
  const [loadingReels, setLoadingReels] = useState(true);
  const [reelsError, setReelsError] = useState<string | null>(null);

  const [mediaId, setMediaId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [templates, setTemplates] = useState("Check your DMs 📩");
  const [dmMessage, setDmMessage] = useState("");
  const [dmLink, setDmLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The picker rides the cache-first my-reels endpoint, so rendering this form
  // normally costs zero Graph API calls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await requestJson<MyReelsResponse>("/api/ig/my-reels");
        if (cancelled) return;
        if (!json.connected) {
          setReelsError("Connect your Instagram account first (Settings → Instagram).");
          return;
        }
        const automated = new Set(automatedMediaIds);
        const onlyReels = (json.media ?? []).filter(
          (m) =>
            m.id &&
            !automated.has(m.id) &&
            (m.media_product_type === "REELS" || m.media_type === "VIDEO")
        );
        setReels(onlyReels);
      } catch {
        if (!cancelled) setReelsError("Could not load your reels. Try refreshing the page.");
      } finally {
        if (!cancelled) setLoadingReels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [automatedMediaIds]);

  const selected = reels.find((r) => r.id === mediaId);

  const submit = () => {
    if (!mediaId) {
      setError("Pick one of your reels first.");
      return;
    }
    if (matchMode !== "any" && !keywords.trim()) {
      setError("At least one keyword is required.");
      return;
    }
    if (!dmMessage.trim()) {
      setError("The DM message is required.");
      return;
    }
    setError(null);

    const data = new FormData();
    data.set("ig_media_id", mediaId);
    if (selected?.caption) data.set("media_caption", selected.caption);
    if (selected?.permalink) data.set("media_permalink", selected.permalink);
    const thumb = selected?.thumbnail_url ?? selected?.media_url;
    if (thumb) data.set("media_thumbnail_url", thumb);
    data.set("keywords", keywords);
    data.set("match_mode", matchMode);
    data.set("public_reply_templates", templates);
    data.set("dm_message", dmMessage);
    data.set("dm_link", dmLink);

    startTransition(async () => {
      try {
        const result = await action({}, data);
        if (result?.error) {
          setError(result.error);
          toast.error(result.error);
          return;
        }
        setMediaId("");
        setKeywords("");
        setDmMessage("");
        setDmLink("");
        toast.success("Automation created — matching comments now get an auto-reply + DM.");
      } catch {
        const message = "Could not create the automation. Please try again.";
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">New automation</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automation_reel">Reel</Label>
            {loadingReels ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your reels…
              </p>
            ) : reelsError ? (
              <p className="text-sm text-amber-300">{reelsError}</p>
            ) : reels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reels available — every reel already has an automation, or your account has no
                reels yet.
              </p>
            ) : (
              <div className="flex items-center gap-3">
                {selected?.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.thumbnail_url}
                    alt="Selected reel"
                    referrerPolicy="no-referrer"
                    className="h-14 w-10 shrink-0 rounded-md object-cover ring-1 ring-border-strong"
                  />
                ) : null}
                <select
                  id="automation_reel"
                  value={mediaId}
                  disabled={isPending}
                  onChange={(e) => setMediaId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">Pick a reel…</option>
                  {reels.map((reel) => (
                    <option key={reel.id} value={reel.id}>
                      {reelLabel(reel)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_match_mode">Match</Label>
            <select
              id="automation_match_mode"
              value={matchMode}
              disabled={isPending}
              onChange={(e) =>
                setMatchMode(
                  e.target.value === "exact" ? "exact" : e.target.value === "any" ? "any" : "contains"
                )
              }
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            >
              <option value="contains">Comment contains a keyword</option>
              <option value="exact">Comment is exactly a keyword</option>
              <option value="any">Any comment (no keywords needed)</option>
            </select>
          </div>

          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Every comment on this reel gets the reply + DM (your own comments and the bot&apos;s
              replies are always ignored). Great for &ldquo;comment anything and I&apos;ll DM you the
              link&rdquo; CTAs — just mind Meta&apos;s ~200 calls/hour limit if the reel goes viral.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="automation_keywords">Keywords (comma separated)</Label>
              <Input
                id="automation_keywords"
                placeholder="link, guide, free"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automation_templates">Public replies (one per line, rotated)</Label>
            <Textarea
              id="automation_templates"
              rows={2}
              placeholder={"Check your DMs 📩\nJust sent it — check your inbox!"}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_dm">DM message</Label>
            <Textarea
              id="automation_dm"
              rows={3}
              placeholder="Hey! Here's the link you asked for 👇"
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_link">Link (sent inside the DM)</Label>
            <Input
              id="automation_link"
              placeholder="https://your-link.com"
              value={dmLink}
              onChange={(e) => setDmLink(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-rose-400">{error}</p> : <span />}
        <Button type="button" onClick={submit} disabled={isPending || loadingReels}>
          {isPending ? "Creating…" : "Create Automation"}
        </Button>
      </div>
    </div>
  );
}
