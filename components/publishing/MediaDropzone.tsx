"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2, Star, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tooltip } from "@/components/ui/tooltip";
import { ALL_UPLOAD_MIME_TYPES } from "@/lib/publishing/capabilities";
import { useDict } from "@/lib/i18n/I18nProvider";
import type { ComposerMedia } from "./composer-media";

type Props = {
  items: ComposerMedia[];
  /** Files the user picked or dropped, in the order they arrived. */
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAltText: (id: string, altText: string) => void;
  onRetry: (id: string) => void;
  /** Index of the slide used as the cover; null hides the cover affordance. */
  coverIndex: number | null;
  onCoverIndex: (index: number) => void;
  disabled?: boolean;
};

const ACCEPT = ALL_UPLOAD_MIME_TYPES.join(",");

export function MediaDropzone({
  items,
  onAdd,
  onRemove,
  onReorder,
  onAltText,
  onRetry,
  coverIndex,
  onCoverIndex,
  disabled = false,
}: Props) {
  const t = useDict().publishing;
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const [dragOver, setDragOver] = useState(false);
  // Index being dragged with a mouse.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Touch fallback: tap a slide to pick it up, tap a gap to drop it. Mirrors the
  // pattern already proven in components/calendar/CalendarView.tsx — HTML5 drag
  // events simply don't fire on touch, and a carousel you can't reorder on a
  // phone is a carousel you can't build on a phone.
  const [rawPlacingIndex, setPlacingIndex] = useState<number | null>(null);

  // A slide can be removed while it's being moved. Clamped during render rather
  // than corrected in an effect, so there's never a frame pointing at a slide
  // that no longer exists.
  const placingIndex =
    rawPlacingIndex != null && rawPlacingIndex < items.length ? rawPlacingIndex : null;

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    onAdd(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(from: number, to: number) {
    if (from === to) return;
    onReorder(from, to);
  }

  return (
    <div className="space-y-3" data-tour="publish-media">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{t.mediaLabel}</Label>
        {items.length > 0 ? (
          <span className="text-xs text-muted-foreground">{t.slideCount(items.length)}</span>
        ) : null}
      </div>

      {/* Drop target. Also the empty state, so there is exactly one place to add
          media whether you have none or thirty. */}
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          // A slide being reordered also fires drop here; ignore it.
          if (e.dataTransfer.files?.length) pick(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed transition ${
          dragOver ? "border-accent-brand bg-accent-brand/5" : "border-border-strong bg-background"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 px-4 py-6 text-start disabled:cursor-not-allowed"
        >
          {items.length > 0 ? (
            <ImagePlus className="h-5 w-5 shrink-0 text-accent-brand" />
          ) : (
            <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {dragOver ? t.dropzoneActive : items.length > 0 ? t.addMoreMedia : t.dropzoneTitle}
            </span>
            <span className="block text-xs text-muted-foreground">{t.dropzoneHint}</span>
          </span>
        </button>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {items.length > 0 ? (
        <>
          {placingIndex != null ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-accent-brand/40 bg-accent-brand/10 px-3 py-2 text-xs text-foreground">
              <span>{t.movingSlide(placingIndex + 1)}</span>
              <button
                type="button"
                onClick={() => setPlacingIndex(null)}
                className="font-medium text-accent-brand hover:underline"
              >
                {t.cancelMove}
              </button>
            </div>
          ) : (
            <p className="text-xs text-subtle">{t.reorderHint}</p>
          )}

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                draggable={!disabled && placingIndex == null}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => {
                  if (dragIndex == null || dragIndex === index) return;
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  if (dragIndex == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(dragIndex, index);
                  setDragIndex(null);
                }}
                className={`group relative flex flex-col gap-2 rounded-xl border bg-card p-2 transition ${
                  dragIndex === index || placingIndex === index
                    ? "border-accent-brand opacity-60"
                    : "border-border"
                }`}
              >
                <div className="relative overflow-hidden rounded-lg bg-black">
                  {/* Object URLs, not uploads: the preview is instant and works
                      while the file is still going up. */}
                  {item.kind === "video" ? (
                    <video
                      src={item.objectUrl}
                      className="aspect-square w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.objectUrl}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                  )}

                  <span className="absolute start-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {index + 1}
                  </span>

                  {coverIndex === index ? (
                    <span className="absolute end-1.5 top-1.5 flex items-center gap-1 rounded-md bg-accent-brand px-1.5 py-0.5 text-[10px] font-semibold text-accent-brand-foreground">
                      <Star className="h-2.5 w-2.5 fill-current" /> {t.coverBadge}
                    </span>
                  ) : null}

                  {item.status === "uploading" ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  ) : null}

                  {item.status === "error" ? (
                    <button
                      type="button"
                      onClick={() => onRetry(item.id)}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger/70 text-[11px] font-medium text-white"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {t.uploadRetry}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(item.id)}
                    aria-label={t.removeSlide}
                    className="absolute end-1.5 bottom-1.5 rounded-full bg-black/60 p-1 text-white transition hover:bg-danger disabled:cursor-not-allowed"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {item.status === "uploading" ? (
                  <Progress value={item.progress} aria-label={t.uploadingLabel} />
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  {coverIndex != null && coverIndex !== index ? (
                    <button
                      type="button"
                      onClick={() => onCoverIndex(index)}
                      className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-accent-brand hover:text-accent-brand"
                    >
                      {t.setCover}
                    </button>
                  ) : null}
                  {placingIndex == null ? (
                    <button
                      type="button"
                      onClick={() => setPlacingIndex(index)}
                      className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:border-accent-brand hover:text-accent-brand sm:hidden"
                    >
                      {t.slideLabel(index + 1)}
                    </button>
                  ) : placingIndex !== index ? (
                    <button
                      type="button"
                      onClick={() => {
                        move(placingIndex, index);
                        setPlacingIndex(null);
                      }}
                      className="rounded-md border border-accent-brand px-1.5 py-0.5 text-[10px] font-medium text-accent-brand sm:hidden"
                    >
                      {t.moveHere}
                    </button>
                  ) : null}
                </div>

                {item.kind === "image" ? (
                  <Tooltip content={t.altTextPlaceholder}>
                    <Input
                      value={item.altText}
                      onChange={(e) => onAltText(item.id, e.target.value)}
                      placeholder={t.altTextLabel}
                      aria-label={`${t.altTextLabel} — ${t.slideLabel(index + 1)}`}
                      className="h-7 text-xs"
                    />
                  </Tooltip>
                ) : null}

                {item.error ? (
                  <p className="text-[10px] leading-tight text-danger" title={item.error}>
                    {item.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
