"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  /** Handle or name used for alt text and the fallback initial. */
  name?: string | null;
  className?: string;
  imgClassName?: string;
}

/**
 * IG CDN URLs are signed and expire, so a present `src` is not a guarantee
 * the image will actually load — the fallback below covers that case, not
 * just the missing-url one.
 */
export function Avatar(props: AvatarProps) {
  // Keyed on src so a src change remounts with a fresh `failed` state
  // instead of needing an effect to reset it.
  return <AvatarInner key={props.src ?? "__none__"} {...props} />;
}

function AvatarInner({ src, name, className, imgClassName }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // The page is server-rendered, so the <img> starts loading before React
  // hydrates. A fast-failing src (expired/hotlink-blocked IG CDN url) can
  // fire its error event before onError is attached — check the already-
  // settled state on mount so that race doesn't leave a broken-image icon.
  React.useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  const showImage = Boolean(src) && !failed;
  const initial = name?.replace(/^@/, "").trim().charAt(0).toUpperCase();

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={src!}
        alt={name ? `@${name.replace(/^@/, "")}` : "Avatar"}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("rounded-full object-cover ring-2 ring-primary/40", className, imgClassName)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent-brand font-semibold text-accent-brand-foreground ring-1 ring-border-strong",
        className
      )}
    >
      {initial || "@"}
    </span>
  );
}
