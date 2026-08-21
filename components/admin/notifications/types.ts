// Shapes shared between the alert settings and inbox panels. Mirrors what
// /api/admin/notifications/* returns; imported as types only, so nothing from
// the server modules is dragged into the client bundle.

import type {
  AdminNotificationPrefs,
  EventPrefs,
} from "@/lib/notifications/prefs";
import type { AlertCategory, AlertEventDef, Severity } from "@/lib/notifications/catalog";

export type { AdminNotificationPrefs, AlertCategory, Severity };

export type ResolvedEvent = AlertEventDef & EventPrefs;

export type AlertCounts = {
  unread: number;
  unresolved: number;
  criticalUnresolved: number;
  last24h: number;
  pendingDigest: number;
};

export type DeliveryInfo = {
  emailConfigured: boolean;
  effectiveRecipients: string[];
  usingEnvFallback: boolean;
  lastDigestAt?: string | null;
};

export type SettingsResponse = {
  prefs: AdminNotificationPrefs;
  events: ResolvedEvent[];
  counts: AlertCounts;
  delivery: DeliveryInfo;
};

// What a settings PUT returns: the same view minus the inbox counts, which the
// save path has no reason to recompute.
export type SettingsUpdate = Omit<SettingsResponse, "counts">;

export type AdminAlertRow = {
  id: string;
  event: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  summary: string | null;
  context: Record<string, string>;
  link: string | null;
  repeat_count: number;
  last_seen_at: string;
  delivery: string;
  delivery_reason: string | null;
  emailed_at: string | null;
  recipients: string[];
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type AlertsResponse = {
  alerts: AdminAlertRow[];
  nextCursor: string | null;
  counts: AlertCounts;
};
