// Combine the caption and hashtags fields into the single string each platform
// expects, trimming empties so we never post a stray newline.
import type { PublishContent } from "./types";

export function buildCaption(content: PublishContent): string {
  return [content.caption?.trim(), content.hashtags?.trim()]
    .filter(Boolean)
    .join("\n\n");
}
