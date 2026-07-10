// Runtime store for the Instagram session cookies yt-dlp needs (Supabase
// `app_settings`, key 'ig_cookies'), with the legacy YTDLP_COOKIES_B64 env var
// as bootstrap fallback. Keeping cookies in the DB (not env) means:
//   1. Rotation without a Vercel redeploy (POST /api/admin/ig-cookies).
//   2. The session self-refreshes: Instagram rotates sessionid/csrftoken and
//      yt-dlp writes the rotated jar back to its cookie file; persisting that
//      here (recordCookieSuccess) is what keeps the session alive long-term.
//
// Every DB touch here is fail-open (caught + logged) — cookie bookkeeping must
// never break a transcript; worst case we degrade to env-var behavior. Writes
// are plain last-write-wins upserts: concurrent lambdas may persist slightly
// different rotated jars, but sessionid (the long-lived credential) is
// identical across them, so any winner works. Cookie CONTENTS are never logged.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const SETTINGS_KEY = "ig_cookies";
const CACHE_TTL_MS = 60_000;

type IgCookieValue = {
  cookies_b64?: string;
  updated_by?: string;
  last_ok_at?: string | null;
  last_error?: string | null;
  last_error_at?: string | null;
  last_alert_at?: string | null;
  rotations?: number;
};

type IgCookieRow = { value: IgCookieValue; updated_at: string } | null;

export type IgCookieStatus = {
  configured: boolean;
  source: "db" | "env" | null;
  updatedAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  rotations: number;
};

// Module-level cache: one DB read per warm lambda per minute. An admin update
// invalidates the updating instance immediately; other warm instances converge
// within CACHE_TTL_MS, which is acceptable staleness.
let cache: { row: IgCookieRow; at: number } | null = null;

export function invalidateIgCookieCache(): void {
  cache = null;
}

async function readRow(): Promise<IgCookieRow> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.row;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data ? { value: (data.value ?? {}) as IgCookieValue, updated_at: data.updated_at } : null;
    cache = { row, at: Date.now() };
    return row;
  } catch (err) {
    console.warn("[ig-cookies] read failed:", err instanceof Error ? err.message : err);
    return cache?.row ?? null;
  }
}

async function writeValue(patch: Partial<IgCookieValue>): Promise<void> {
  try {
    const admin = createAdminClient();
    const current = (await readRow())?.value ?? {};
    const next: IgCookieValue = { ...current, ...patch };
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    invalidateIgCookieCache();
  } catch (err) {
    console.warn("[ig-cookies] write failed:", err instanceof Error ? err.message : err);
  }
}

// DB first, env fallback. Returns null when neither is configured.
export async function loadIgCookiesB64(): Promise<{ b64: string; source: "db" | "env" } | null> {
  const row = await readRow();
  const dbCookies = row?.value.cookies_b64?.trim();
  if (dbCookies) {
    return { b64: dbCookies, source: "db" };
  }
  const envCookies = process.env.YTDLP_COOKIES_B64?.trim();
  if (envCookies) {
    return { b64: envCookies, source: "env" };
  }
  return null;
}

// Status for diagnostics/admin — never includes cookie material.
export async function getIgCookieStatus(): Promise<IgCookieStatus> {
  const row = await readRow();
  const hasDb = Boolean(row?.value.cookies_b64?.trim());
  const hasEnv = Boolean(process.env.YTDLP_COOKIES_B64?.trim());
  return {
    configured: hasDb || hasEnv,
    source: hasDb ? "db" : hasEnv ? "env" : null,
    updatedAt: hasDb ? (row?.updated_at ?? null) : null,
    lastOkAt: row?.value.last_ok_at ?? null,
    lastError: row?.value.last_error ?? null,
    lastErrorAt: row?.value.last_error_at ?? null,
    rotations: row?.value.rotations ?? 0,
  };
}

export async function saveIgCookies(b64: string, updatedBy: string): Promise<void> {
  await writeValue({
    cookies_b64: b64,
    updated_by: updatedBy,
    last_error: null,
    last_error_at: null,
  });
}

// One write per successful cookie-authenticated run: stamps last_ok_at, and
// when yt-dlp rotated the jar, persists the rotated cookies (the self-refresh).
// Also seeds the DB row on the first success when cookies still come from the
// env var, migrating off it with zero manual steps.
export async function recordCookieSuccess(rotatedB64?: string): Promise<void> {
  const row = await readRow();
  const hadDbCookies = Boolean(row?.value.cookies_b64?.trim());
  const patch: Partial<IgCookieValue> = {
    last_ok_at: new Date().toISOString(),
    last_error: null,
    last_error_at: null,
  };
  if (rotatedB64) {
    patch.cookies_b64 = rotatedB64;
    patch.updated_by = "write-back";
    patch.rotations = (row?.value.rotations ?? 0) + 1;
  } else if (!hadDbCookies) {
    const envCookies = process.env.YTDLP_COOKIES_B64?.trim();
    if (envCookies) {
      patch.cookies_b64 = envCookies;
      patch.updated_by = "env-seed";
    }
  }
  await writeValue(patch);
}

export async function recordCookieFailure(detail: string): Promise<void> {
  await writeValue({
    last_error: detail.slice(0, 400),
    last_error_at: new Date().toISOString(),
  });
}

// Email throttle for the health cron: claims an alert slot if none was claimed
// within minIntervalMs. Read-modify-write (not atomic) — a racing duplicate
// email is harmless and the cron runs once a day anyway.
export async function claimAlertSlot(minIntervalMs: number): Promise<boolean> {
  const row = await readRow();
  const last = row?.value.last_alert_at ? Date.parse(row.value.last_alert_at) : 0;
  if (Number.isFinite(last) && Date.now() - last < minIntervalMs) {
    return false;
  }
  await writeValue({ last_alert_at: new Date().toISOString() });
  return true;
}
