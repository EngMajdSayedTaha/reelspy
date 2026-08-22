// One icon per platform, shared by the connection cards and the composer's
// target picker.
//
// Lives in its own client module because component functions can't cross the
// Server→Client boundary — a server page can't hand an icon down as a prop, so
// both client components import the map instead.

import { AtSign, Camera, Music2, PlayCircle, ThumbsUp, type LucideIcon } from "lucide-react";
import type { Platform } from "@/lib/publishing/types";

export const PLATFORM_ICONS: Record<Platform, LucideIcon> = {
  instagram: Camera,
  facebook: ThumbsUp,
  tiktok: Music2,
  youtube: PlayCircle,
  // Threads' logo is an @ ligature; AtSign is the closest thing lucide carries.
  threads: AtSign,
};
