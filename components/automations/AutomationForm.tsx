"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Clapperboard, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isReelItem } from "@/lib/instagram/insights-export";
import { requestJson } from "@/lib/utils/api";
import { useDict, useLocale } from "@/lib/i18n/I18nProvider";
import { intlLocale } from "@/lib/i18n/intl";
import type { Locale } from "@/lib/i18n/config";

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

function reelLabel(reel: MyReel, locale: Locale, noCaption: string): string {
  const date = reel.timestamp
    ? new Date(reel.timestamp).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric" })
    : "";
  const caption = (reel.caption ?? "").replace(/\s+/g, " ").trim();
  const snippet = caption ? caption.slice(0, 60) + (caption.length > 60 ? "…" : "") : noCaption;
  return date ? `${date} — ${snippet}` : snippet;
}

export function AutomationForm({ action, automatedMediaIds }: AutomationFormProps) {
  const fullDict = useDict();
  const dict = fullDict.automations;
  const locale = useLocale();
  const [reels, setReels] = useState<MyReel[]>([]);
  const [loadingReels, setLoadingReels] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reelsError, setReelsError] = useState<string | null>(null);

  const [mediaId, setMediaId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [templates, setTemplates] = useState("Check your DMs 📩");
  const [dmMessage, setDmMessage] = useState("");
  const [dmLink, setDmLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The picker rides the cache-first my-reels endpoint, so the initial load
  // normally costs zero Graph API calls. `force` hits the endpoint with
  // ?refresh=1 for a live Instagram pull — needed to surface a just-posted reel
  // that isn't in the cache yet.
  const loadReels = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true);
      setReelsError(null);
      try {
        const json = await requestJson<MyReelsResponse>(
          force ? "/api/ig/my-reels?refresh=1" : "/api/ig/my-reels",
          { cache: "no-store" }
        );
        if (!json.connected) {
          setReelsError(dict.form.connectInstagramFirst);
          return;
        }
        const automated = new Set(automatedMediaIds);
        const onlyReels = (json.media ?? []).filter(
          (m) => m.id && !automated.has(m.id) && isReelItem(m)
        );
        setReels(onlyReels);
      } catch {
        setReelsError(dict.form.couldNotLoadReels);
      } finally {
        setLoadingReels(false);
        setRefreshing(false);
      }
    },
    [automatedMediaIds, dict]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the initial async fetch
    loadReels();
  }, [loadReels]);

  const selected = reels.find((r) => r.id === mediaId);

  const submit = () => {
    if (!mediaId) {
      setError(dict.errors.reelRequired);
      return;
    }
    if (matchMode !== "any" && !keywords.trim()) {
      setError(dict.errors.keywordRequired);
      return;
    }
    if (!dmMessage.trim()) {
      setError(dict.errors.dmMessageRequired);
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
        toast.success(dict.form.createSuccess);
      } catch {
        const message = dict.form.createError;
        setError(message);
        toast.error(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">{dict.form.newAutomation}</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="automation_reel">{dict.form.reelLabel}</Label>
              <button
                type="button"
                onClick={() => loadReels(true)}
                disabled={isPending || refreshing}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                title={dict.form.refreshTitle}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? dict.form.refreshSyncing : dict.form.refresh}
              </button>
            </div>
            {loadingReels ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {dict.form.loadingReels}
              </p>
            ) : reelsError ? (
              <p className="text-sm text-warning">{reelsError}</p>
            ) : reels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dict.form.noReelsAvailable}
              </p>
            ) : (
              <div className="flex min-w-0 items-center gap-3">
                {selected?.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.thumbnail_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-14 w-10 shrink-0 rounded-md object-cover ring-1 ring-border-strong"
                  />
                ) : null}
                <select
                  id="automation_reel"
                  value={mediaId}
                  disabled={isPending}
                  onChange={(e) => setMediaId(e.target.value)}
                  className="h-9 w-full min-w-0 rounded-lg border border-border-strong bg-surface-2 px-2 text-base md:text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                >
                  <option value="">{dict.form.pickReel}</option>
                  {reels.map((reel) => (
                    <option key={reel.id} value={reel.id}>
                      {reelLabel(reel, locale, dict.card.noCaption)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_match_mode">{dict.form.matchLabel}</Label>
            <select
              id="automation_match_mode"
              value={matchMode}
              disabled={isPending}
              onChange={(e) =>
                setMatchMode(
                  e.target.value === "exact" ? "exact" : e.target.value === "any" ? "any" : "contains"
                )
              }
              className="h-9 w-full rounded-lg border border-border-strong bg-surface-2 px-2 text-base text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:opacity-60 md:text-sm"
            >
              <option value="contains">{dict.form.matchContains}</option>
              <option value="exact">{dict.form.matchExact}</option>
              <option value="any">{dict.form.matchAny}</option>
            </select>
          </div>

          {matchMode === "any" ? (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              {dict.form.anyCommentHint}
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="automation_keywords">{dict.form.keywordsLabel}</Label>
              <Input
                id="automation_keywords"
                placeholder={dict.form.keywordsPlaceholder}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automation_templates">{dict.form.publicRepliesLabel}</Label>
            <Textarea
              id="automation_templates"
              rows={2}
              placeholder={dict.form.publicRepliesPlaceholder}
              value={templates}
              onChange={(e) => setTemplates(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_dm">{dict.form.dmMessageLabel}</Label>
            <Textarea
              id="automation_dm"
              rows={3}
              placeholder={dict.form.dmMessagePlaceholder}
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation_link">{dict.form.linkLabel}</Label>
            <Input
              id="automation_link"
              placeholder={dict.form.linkPlaceholder}
              value={dmLink}
              onChange={(e) => setDmLink(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {error ? <p className="text-sm text-danger">{error}</p> : <span className="hidden sm:block" />}
        <Button
          type="button"
          onClick={submit}
          disabled={isPending || loadingReels}
          className="w-full sm:w-auto"
        >
          {isPending ? dict.form.creating : dict.form.createAutomation}
        </Button>
      </div>
    </div>
  );
}
