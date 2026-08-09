import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/track";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";
import { numEnv } from "@/lib/utils/env";

// Download one tracked account's reel archive as CSV, JSON, or plain text.
//
// Server-side rather than built in the browser: an archived account runs to
// thousands of reels with full captions, which is more than a client should be
// asked to hold in memory and hand to a Blob. Rows are streamed out in pages, so
// peak memory is one page regardless of archive size.
//
// Two modes:
//   - `metadata` (default): every reel, performance columns only. What the
//     export has always been, unchanged.
//   - `transcripts`: only reels that HAVE a transcript, with the text included.
//     The filter is the point — this mode exists to be fed to an AI, and rows
//     with an empty transcript column are pure noise in that document.
export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = numEnv("ARCHIVE_EXPORT_PAGE", 500);
// Transcripts are hundreds of times larger per row than the metadata columns, so
// a transcript page holds far fewer reels to keep peak memory in the same place.
const TRANSCRIPT_PAGE = numEnv("ARCHIVE_EXPORT_TRANSCRIPT_PAGE", 50);
// A ceiling that no real account reaches (the archive itself stops at 2000),
// but which stops a pathological row count from running the function to death.
const MAX_ROWS = numEnv("ARCHIVE_EXPORT_MAX_ROWS", 20_000);

type ExportFormat = "csv" | "json" | "txt";
type ExportMode = "metadata" | "transcripts";

type ReelRow = {
  ig_media_id: string;
  ig_permalink: string | null;
  caption: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
  is_favorite: boolean | null;
  is_discarded: boolean | null;
  transcript_status: string | null;
  transcript: string | null;
  transcript_lang: string | null;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Interactions per 100 views. Views can be 0 or missing on older media, and
// dividing by that would emit Infinity into a spreadsheet.
function engagementRate(row: ReelRow): string {
  const views = row.view_count ?? 0;
  if (views <= 0) return "";
  const interactions = (row.like_count ?? 0) + (row.comment_count ?? 0);
  return ((interactions / views) * 100).toFixed(2);
}

const BASE_CSV_HEADER = [
  "posted_at",
  "views",
  "likes",
  "comments",
  "engagement_rate_pct",
  "permalink",
  "caption",
  "favorite",
  "discarded",
  "transcript_status",
  "ig_media_id",
];

function csvHeader(mode: ExportMode): string[] {
  return mode === "transcripts"
    ? [...BASE_CSV_HEADER, "transcript_lang", "transcript"]
    : BASE_CSV_HEADER;
}

// Newlines survive CSV quoting, but they turn one reel into several visual rows
// in every spreadsheet app — which is worse than losing the line breaks. Applied
// to captions and transcripts alike; JSON and TXT keep the original formatting.
function flatten(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function csvRow(row: ReelRow, mode: ExportMode): string {
  const cells: (string | number | null)[] = [
    row.posted_at ?? "",
    row.view_count ?? "",
    row.like_count ?? "",
    row.comment_count ?? "",
    engagementRate(row),
    row.ig_permalink ?? "",
    flatten(row.caption),
    row.is_favorite ? "yes" : "",
    row.is_discarded ? "yes" : "",
    row.transcript_status ?? "",
    row.ig_media_id,
  ];

  if (mode === "transcripts") {
    cells.push(row.transcript_lang ?? "", flatten(row.transcript));
  }

  return cells.map(csvEscape).join(",");
}

function jsonRow(row: ReelRow, mode: ExportMode) {
  const base = {
    ig_media_id: row.ig_media_id,
    posted_at: row.posted_at,
    permalink: row.ig_permalink,
    caption: row.caption,
    view_count: row.view_count ?? 0,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    engagement_rate_pct: engagementRate(row) === "" ? null : Number(engagementRate(row)),
    favorite: Boolean(row.is_favorite),
    discarded: Boolean(row.is_discarded),
    transcript_status: row.transcript_status,
  };

  return mode === "transcripts"
    ? { ...base, transcript_lang: row.transcript_lang, transcript: row.transcript }
    : base;
}

// One reel as a readable block. This format exists because the whole point of
// the transcripts export is to paste it into an AI: a model reads a labelled
// document far more reliably than it reads a CSV of quoted, comma-spliced
// fields, and the per-reel metrics give it the context to tell which advice
// actually worked.
function txtRow(row: ReelRow, index: number): string {
  const posted = row.posted_at ? row.posted_at.slice(0, 10) : "unknown date";
  const rate = engagementRate(row);
  const stats = [
    `${(row.view_count ?? 0).toLocaleString("en-US")} views`,
    `${(row.like_count ?? 0).toLocaleString("en-US")} likes`,
    `${(row.comment_count ?? 0).toLocaleString("en-US")} comments`,
    rate ? `${rate}% engagement` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    `--- Reel ${index} · ${posted} ---`,
    stats,
    row.ig_permalink ? `Link: ${row.ig_permalink}` : null,
    row.caption ? `Caption: ${flatten(row.caption)}` : null,
    "",
    "Transcript:",
    row.transcript?.trim() || "(empty)",
    "",
    "",
  ];

  return lines.filter((line) => line !== null).join("\n");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const rawFormat = params.get("format");
  const format: ExportFormat =
    rawFormat === "json" ? "json" : rawFormat === "txt" ? "txt" : "csv";
  // A text dump without transcripts would just be a worse CSV, so that format
  // always carries them; the other two ask explicitly.
  const mode: ExportMode =
    format === "txt" || params.get("mode") === "transcripts" ? "transcripts" : "metadata";

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required." }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("inspiration_accounts")
    .select("id, ig_username, display_name, followers_count")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Cheap to serve but reads the user's whole archive each time, so it gets the
  // same treatment as the other export endpoint.
  const { allowed, retryAfterSeconds } = await consumeUserAction(
    supabase,
    user.id,
    "account_export"
  );
  if (!allowed) {
    const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `You're exporting a lot. Try again in about ${mins} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterSeconds)) } }
    );
  }

  const exportedAt = new Date().toISOString();
  const suffix = mode === "transcripts" ? "-transcripts" : "";
  const filename = `reelspy-${account.ig_username}-${exportedAt.slice(0, 10)}${suffix}.${format}`;

  const encoder = new TextEncoder();
  const pageSize = mode === "transcripts" ? TRANSCRIPT_PAGE : PAGE;
  let rowsWritten = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      try {
        if (format === "csv") {
          // BOM so Excel reads UTF-8 — without it, Arabic captions and emoji
          // arrive as mojibake, which is most of what a caption column holds.
          write("﻿");
          write(`${csvHeader(mode).join(",")}\n`);
        } else if (format === "json") {
          write(
            `{"exported_at":${JSON.stringify(exportedAt)},` +
              `"account":${JSON.stringify({
                username: account.ig_username,
                display_name: account.display_name,
                followers_count: account.followers_count,
              })},"reels":[`
          );
        } else {
          write(
            `Reel transcripts for @${account.ig_username}\n` +
              `Exported ${exportedAt.slice(0, 10)} by reelspy\n\n` +
              `Each block below is one reel: when it was posted, how it performed,\n` +
              `and what was said in it.\n\n`
          );
        }

        const columns =
          "ig_media_id, ig_permalink, caption, view_count, like_count, comment_count, posted_at, is_favorite, is_discarded, transcript_status" +
          (mode === "transcripts" ? ", transcript, transcript_lang" : "");

        for (let offset = 0; offset < MAX_ROWS; offset += pageSize) {
          let query = supabase
            .from("tracked_reels")
            .select(columns)
            .eq("user_id", user.id)
            .eq("account_id", account.id);

          // Only reels that actually carry text — see the mode note at the top.
          if (mode === "transcripts") {
            query = query.eq("transcript_status", "ready").not("transcript", "is", null);
          }

          const { data, error } = await query
            .order("posted_at", { ascending: false, nullsFirst: false })
            // Stable tie-break: reels sharing a posted_at have no inherent order,
            // and an unstable one would duplicate some rows and drop others.
            .order("ig_media_id", { ascending: false })
            .range(offset, offset + pageSize - 1)
            .returns<ReelRow[]>();

          if (error) throw new Error(error.message);
          const rows = data ?? [];
          if (rows.length === 0) break;

          for (const row of rows) {
            if (format === "csv") {
              write(`${csvRow(row, mode)}\n`);
            } else if (format === "json") {
              write(`${rowsWritten > 0 ? "," : ""}${JSON.stringify(jsonRow(row, mode))}`);
            } else {
              write(txtRow(row, rowsWritten + 1));
            }
            rowsWritten += 1;
          }

          if (rows.length < pageSize) break;
        }

        if (format === "json") {
          write(`],"count":${rowsWritten}}`);
        } else if (format === "txt" && rowsWritten === 0) {
          // An empty file reads as a broken download. Say which of the two
          // reasons it is, since the fix differs.
          write("No transcripts yet for this account. Run \"Transcribe all\" first.\n");
        }

        controller.close();
      } catch (err) {
        // The response headers are long gone by the time this can fail, so the
        // download can't become an error page. Close the JSON structure and let
        // the truncation be visible rather than emitting a corrupt file.
        console.error(
          `[archive-export] failed for @${account.ig_username}:`,
          err instanceof Error ? err.message : err
        );
        if (format === "json") {
          write(`],"count":${rowsWritten},"truncated":true}`);
        }
        controller.close();
      }
    },
  });

  await track(user.id, "archive_exported", {
    username: account.ig_username,
    format,
    mode,
  });

  const contentType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : format === "json"
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8";

  return new NextResponse(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
