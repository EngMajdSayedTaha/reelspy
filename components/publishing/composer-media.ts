// The composer's view of one slide: the picked File plus everything measured or
// learned about it, from local preview URL through upload progress to the R2
// key the server action finally receives.
//
// Kept in its own module so MediaDropzone, PublishPreview and PublishComposer
// share one shape instead of three near-identical local types.

import type { DraftMedia } from "@/lib/publishing/validate";
import type { MediaItemKind } from "@/lib/publishing/types";

export type ComposerMediaStatus = "pending" | "uploading" | "done" | "error";

export type ComposerMedia = {
  /** Local id — the React key and the handle every callback uses. */
  id: string;
  file: File;
  kind: MediaItemKind;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string;
  /** Blob URL for the preview; revoked when the slide is removed. */
  objectUrl: string;
  status: ComposerMediaStatus;
  /** 0–100 while uploading. */
  progress: number;
  /** R2 object key, set once the upload lands. */
  path: string | null;
  error: string | null;
};

/** The subset the validator needs — it never sees Files or upload state. */
export function toDraftMedia(item: ComposerMedia): DraftMedia {
  return {
    kind: item.kind,
    mimeType: item.mimeType,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    altText: item.altText,
  };
}
