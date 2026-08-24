"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { requestJson } from "@/lib/utils/api";
import { useDict } from "@/lib/i18n/I18nProvider";

// TikTok's UX guidelines require the composer to show the real creator and the
// creator's REAL privacy options for the account being posted to — never a
// hardcoded list — plus an explicit Music Usage / Terms confirmation before the
// post can go out. That is what this whole panel exists for; none of it is
// decoration and none of it can be dropped without breaking the app audit.
// Extracted verbatim from PublishComposer when the composer was split up.

export type TikTokCreatorInfo = {
  creatorAvatarUrl: string | null;
  creatorUsername: string | null;
  creatorNickname: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
};

export type TikTokPanelState = {
  postMode: "direct" | "draft";
  privacyLevel: string;
  brandedContent: boolean;
  brandOrganic: boolean;
  autoAddMusic: boolean;
  confirmed: boolean;
};

export const TIKTOK_DEFAULTS: TikTokPanelState = {
  postMode: "direct",
  privacyLevel: "",
  brandedContent: false,
  brandOrganic: false,
  autoAddMusic: true,
  confirmed: false,
};

type Props = {
  state: TikTokPanelState;
  onChange: (patch: Partial<TikTokPanelState>) => void;
  /** Whether TikTok can post publicly yet (server reads TIKTOK_ALLOW_PUBLIC). */
  publicAllowed: boolean;
  /** True when the post is a photo carousel — enables the photo-only fields. */
  isPhotoPost: boolean;
  onInfo: (info: TikTokCreatorInfo | null) => void;
};

/**
 * Branded content can't go out privately — TikTok rejects it, because the
 * disclosure has to reach an audience. Mirrored in the server action and once
 * more in the adapter, so no layer is the only thing enforcing it.
 */
export function tiktokBrandedBlocked(state: TikTokPanelState, publicAllowed: boolean): boolean {
  return (
    state.brandedContent &&
    state.postMode === "direct" &&
    (state.privacyLevel === "SELF_ONLY" || !publicAllowed)
  );
}

export function TikTokPanel({ state, onChange, publicAllowed, isPhotoPost, onInfo }: Props) {
  const t = useDict().publishing;
  const [info, setInfo] = useState<TikTokCreatorInfo | null>(null);
  // Starts true: the fetch below runs on mount, so the panel is loading from
  // its very first frame. Setting it inside the effect would flash the empty
  // state for one render and trip the cascading-render lint.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the creator's real account info (avatar/nickname + privacy_level
  // options) once, on mount. Never a hardcoded privacy list, per TikTok's UX
  // guidelines.
  useEffect(() => {
    let cancelled = false;

    requestJson<TikTokCreatorInfo>("/api/publishing/tiktok/creator-info")
      .then((fetched) => {
        if (cancelled) return;
        setInfo(fetched);
        onInfo(fetched);
        onChange({ privacyLevel: state.privacyLevel || fetched.privacyLevelOptions[0] || "SELF_ONLY" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        onInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandedBlocked = tiktokBrandedBlocked(state, publicAllowed);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <Label>{t.tiktokSettings.heading}</Label>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.tiktokSettings.loading}
        </p>
      ) : error ? (
        <p className="text-xs text-danger">{t.tiktokSettings.loadFailed(error)}</p>
      ) : info ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {info.creatorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.creatorAvatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-strong"
              />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded-full bg-secondary ring-1 ring-border-strong" />
            )}
            <span className="text-muted-foreground">
              {t.tiktokSettings.postingAsPrefix}{" "}
              <span className="font-medium text-foreground">
                {info.creatorNickname ?? info.creatorUsername ?? "—"}
              </span>
            </span>
          </div>

          <div className="space-y-2">
            <Label>{t.tiktokSettings.postModeLabel}</Label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tiktok-post-mode"
                  checked={state.postMode === "direct"}
                  onChange={() => onChange({ postMode: "direct" })}
                />
                {t.tiktokSettings.postModeDirect}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tiktok-post-mode"
                  checked={state.postMode === "draft"}
                  onChange={() => onChange({ postMode: "draft" })}
                />
                {t.tiktokSettings.postModeDraft}
              </label>
              {state.postMode === "draft" ? (
                <p className="text-xs text-subtle">{t.tiktokSettings.postModeDraftHint}</p>
              ) : null}
            </div>
          </div>

          {state.postMode === "direct" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="pub-tiktok-privacy">{t.tiktokSettings.privacyLevelLabel}</Label>
                <select
                  id="pub-tiktok-privacy"
                  value={state.privacyLevel}
                  onChange={(e) => onChange({ privacyLevel: e.target.value })}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-base md:text-sm"
                >
                  {info.privacyLevelOptions.map((level) => (
                    <option key={level} value={level}>
                      {t.tiktokSettings.privacyLevelLabelFor(level)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>{t.tiktokSettings.disclosureLabel}</Label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.brandedContent}
                    onChange={(e) => onChange({ brandedContent: e.target.checked })}
                  />
                  {t.tiktokSettings.brandedContentLabel}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.brandOrganic}
                    onChange={(e) => onChange({ brandOrganic: e.target.checked })}
                  />
                  {t.tiktokSettings.brandOrganicLabel}
                </label>
                {brandedBlocked ? (
                  <p className="text-xs text-warning">
                    {!publicAllowed
                      ? t.tiktokSettings.brandedNeedsAuditWarning
                      : t.tiktokSettings.brandedPrivacyWarning}
                  </p>
                ) : null}
              </div>

              {isPhotoPost ? (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.autoAddMusic}
                      onChange={(e) => onChange({ autoAddMusic: e.target.checked })}
                    />
                    {t.tiktokSettings.autoAddMusicLabel}
                  </label>
                  <p className="text-xs text-subtle">{t.tiktokSettings.autoAddMusicHint}</p>
                </div>
              ) : null}
            </>
          ) : null}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.confirmed}
              onChange={(e) => onChange({ confirmed: e.target.checked })}
            />
            <span>
              {t.tiktokSettings.confirmBefore}
              <a
                href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {t.tiktokSettings.musicUsageLink}
              </a>
              {t.tiktokSettings.confirmMiddle}
              <a
                href="https://www.tiktok.com/legal/page/global/terms-of-service/en"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {t.tiktokSettings.termsOfServiceLink}
              </a>
              {t.tiktokSettings.confirmAfter}
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
