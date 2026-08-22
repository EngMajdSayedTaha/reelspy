"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PLATFORM_ICONS } from "@/components/publishing/platform-icons";
import {
  PLATFORM_CAPS,
  countCharacters,
  countHashtags,
} from "@/lib/publishing/capabilities";
import { PLATFORM_LABELS, type Platform } from "@/lib/publishing/types";
import { useDict } from "@/lib/i18n/I18nProvider";

type Props = {
  title: string;
  onTitle: (value: string) => void;
  hashtags: string;
  onHashtags: (value: string) => void;
  caption: string;
  onCaption: (value: string) => void;
  perPlatform: boolean;
  onPerPlatform: (value: boolean) => void;
  platformCaptions: Partial<Record<Platform, string>>;
  onPlatformCaption: (platform: Platform, value: string) => void;
  selected: Platform[];
};

/**
 * The counter that matters: what the platform will actually receive, which is
 * the effective caption (override or shared) plus the hashtags block — exactly
 * how lib/publishing/caption.ts joins them. A counter on the caption box alone
 * would tell the user they had room they don't have.
 */
function CharacterMeter({
  text,
  max,
  hashtagMax,
}: {
  text: string;
  max: number;
  hashtagMax: number | null;
}) {
  const t = useDict().publishing;
  const used = countCharacters(text);
  const over = used - max;
  const tags = hashtagMax != null ? countHashtags(text) : 0;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
      {hashtagMax != null ? (
        <span className={tags > hashtagMax ? "font-medium text-danger" : "text-muted-foreground"}>
          {t.hashtagCount(tags, hashtagMax)}
        </span>
      ) : null}
      <span
        className={
          over > 0
            ? "font-medium text-danger"
            : over > -50
              ? "text-warning"
              : "text-muted-foreground"
        }
      >
        {over > 0 ? t.charactersOver(over) : t.charactersLeft(max - used, max)}
      </span>
    </div>
  );
}

export function CaptionEditor({
  title,
  onTitle,
  hashtags,
  onHashtags,
  caption,
  onCaption,
  perPlatform,
  onPerPlatform,
  platformCaptions,
  onPlatformCaption,
  selected,
}: Props) {
  const t = useDict().publishing;

  const [pinnedTab, setPinnedTab] = useState<Platform | null>(null);
  const activeTab =
    pinnedTab && selected.includes(pinnedTab) ? pinnedTab : (selected[0] ?? "");
  const setActiveTab = (value: string) => setPinnedTab(value as Platform);

  // The strictest selected platform drives the shared caption's meter, so the
  // number shown is the one that can actually block the post.
  const tightest = selected.reduce<Platform | null>((worst, platform) => {
    if (!worst) return platform;
    return PLATFORM_CAPS[platform].captionMax < PLATFORM_CAPS[worst].captionMax ? platform : worst;
  }, null);

  const sharedEffective = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-4" data-tour="publish-caption">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pub-title">{t.titleLabel}</Label>
          <Input
            id="pub-title"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder={t.optionalTitlePlaceholder}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pub-hashtags">{t.hashtagsLabel}</Label>
          <Input
            id="pub-hashtags"
            value={hashtags}
            onChange={(e) => onHashtags(e.target.value)}
            placeholder={t.hashtagsPlaceholder}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pub-caption">{t.captionLabel}</Label>
        <Textarea
          id="pub-caption"
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
          placeholder={t.captionPlaceholder}
          rows={4}
        />
        {tightest ? (
          <CharacterMeter
            text={sharedEffective}
            max={PLATFORM_CAPS[tightest].captionMax}
            hashtagMax={PLATFORM_CAPS[tightest].hashtagMax}
          />
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <Label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={perPlatform}
            onChange={(e) => onPerPlatform(e.target.checked)}
          />
          {t.customizeCaptionPerPlatform}
        </Label>

        {!perPlatform ? (
          <p className="text-xs text-subtle">{t.perPlatformOffHint}</p>
        ) : selected.length === 0 ? (
          <p className="text-xs text-warning">{t.selectPlatformToCustomize}</p>
        ) : (
          // Controlled, and clamped to the current selection during render:
          // with an uncontrolled `defaultValue` the tabs keep pointing at a
          // platform the user just deselected, and Radix then renders no panel
          // at all.
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList aria-label={t.customizeCaptionPerPlatform}>
              {selected.map((platform) => {
                const Icon = PLATFORM_ICONS[platform];
                return (
                  <TabsTrigger key={platform} value={platform}>
                    <Icon className="h-3.5 w-3.5" />
                    {PLATFORM_LABELS[platform]}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {selected.map((platform) => {
              const value = platformCaptions[platform] ?? "";
              const effective = [
                (value.trim() || caption.trim()),
                hashtags.trim(),
              ]
                .filter(Boolean)
                .join("\n\n");

              return (
                <TabsContent key={platform} value={platform} className="space-y-1.5">
                  <Label htmlFor={`pub-caption-${platform}`} className="text-xs">
                    {t.platformCaptionLabel(PLATFORM_LABELS[platform])}
                  </Label>
                  <Textarea
                    id={`pub-caption-${platform}`}
                    value={value}
                    onChange={(e) => onPlatformCaption(platform, e.target.value)}
                    placeholder={
                      caption.trim()
                        ? t.leaveBlankPlaceholder
                        : t.captionForPlatformPlaceholder(PLATFORM_LABELS[platform])
                    }
                    rows={3}
                  />
                  <CharacterMeter
                    text={effective}
                    max={PLATFORM_CAPS[platform].captionMax}
                    hashtagMax={PLATFORM_CAPS[platform].hashtagMax}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
}
