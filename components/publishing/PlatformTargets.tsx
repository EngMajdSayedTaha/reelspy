"use client";

import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { PLATFORM_ICONS } from "@/components/publishing/platform-icons";
import { PLATFORM_CAPS } from "@/lib/publishing/capabilities";
import { platformAcceptsMedia } from "@/lib/publishing/validate";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { ComposerMedia } from "./composer-media";
import { toDraftMedia } from "./composer-media";

type Props = {
  connected: Record<Platform, boolean>;
  handles: Partial<Record<Platform, string | null>>;
  selected: Set<Platform>;
  onToggle: (platform: Platform) => void;
  media: ComposerMedia[];
};

/**
 * Platform picker. Every card says what it can take with the media currently
 * loaded, and a card that can't take it is disabled WITH THE REASON VISIBLE —
 * the old chip row just greyed out and left the user guessing.
 */
export function PlatformTargets({ connected, handles, selected, onToggle, media }: Props) {
  const t = useDict().publishing;
  const draft = media.map(toDraftMedia);
  const anyConnected = PLATFORMS.some((p) => connected[p]);

  function capabilityLine(platform: Platform): string {
    const cap = PLATFORM_CAPS[platform];
    if (!cap.carousel) return t.capVideoOnly;
    return cap.carousel.itemKinds.includes("video")
      ? t.capCarousel(cap.carousel.max)
      : t.capPhotoCarousel(cap.carousel.max);
  }

  return (
    <div className="space-y-2" data-tour="publish-targets">
      <Label>{t.postToLabel}</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const Icon = PLATFORM_ICONS[platform];
          const isConn = connected[platform];
          const fits = platformAcceptsMedia(platform, draft);
          const disabled = !isConn || !fits;
          const isOn = selected.has(platform) && !disabled;

          const reason = !isConn
            ? t.connectFirstHint
            : !fits
              ? t.incompatibleWithMedia
              : capabilityLine(platform);

          return (
            <Tooltip key={platform} content={reason}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={isOn}
                onClick={() => onToggle(platform)}
                className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition ${
                  isOn
                    ? "border-accent-brand bg-accent-brand/10"
                    : "border-border bg-background hover:border-border-strong"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isOn ? "text-accent-brand" : "text-muted-foreground"}`}
                />
                <span className="min-w-0 flex-1 leading-tight">
                  <span
                    className={`block truncate text-sm font-medium ${
                      isOn ? "text-accent-brand" : "text-foreground"
                    }`}
                  >
                    {PLATFORM_LABELS[platform]}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {!isConn
                      ? t.notConnectedLabel
                      : !fits
                        ? t.incompatibleWithMedia
                        : (handles[platform] ?? capabilityLine(platform))}
                  </span>
                </span>
                {isOn ? <Check className="h-4 w-4 shrink-0 text-accent-brand" /> : null}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {!anyConnected ? <p className="text-xs text-warning">{t.connectAtLeastOne}</p> : null}
    </div>
  );
}
