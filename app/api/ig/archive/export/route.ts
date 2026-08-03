import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/track";
import { consumeUserAction } from "@/lib/utils/user-rate-limit";
import { numEnv } from "@/lib/utils/env";

// Download one tracked account's reel archive as CSV or JSON.
//
// Server-side rather than built in the browser: an archived account runs to
// thousands of reels with full captions, which is more than a client should be
// asked to hold in memory and hand to a Blob. Rows are streamed out in pages, so
// peak memory is one page regardless of archive size.
export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = numEnv("ARCHIVE_EXPORT_PAGE", 500);
// A ceiling that no real account reaches (the archive itself stops at 2000),
// but which stops a pathological row count from running the function to death.
const MAX_ROWS = numEnv("ARCHIVE_EXPORT_MAX_ROWS", 20_000);

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

const CSV_HEADER = [
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

function csvRow(row: ReelRow): string {
  return [
    row.posted_at ?? "",
    row.view_count ?? "",
    row.like_count ?? "",
    row.comment_count ?? "",
    engagementRate(row),
    row.ig_permalink ?? "",
    // Newlines survive CSV quoting, but they turn one reel into several visual
    // rows in every spreadsheet app — which is worse than losing the line breaks.
    row.caption?.replace(/\s+/g, " ").trim() ?? "",
    row.is_favorite ? "yes" : "",
    row.is_discarded ? "yes" : "",
    row.transcript_status ?? "",
    row.ig_media_id,
  ]
    .map(csvEscape)
    .join(",");
}

function jsonRow(row: ReelRow) {
  return {
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
  const format = params.get("format") === "json" ? "json" : "csv";

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
  const filename = `reelspy-${account.ig_username}-${exportedAt.slice(0, 10)}.${format}`;

  const encoder = new TextEncoder();
  let rowsWritten = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      try {
        if (format === "csv") {
          // BOM so Excel reads UTF-8 — without it, Arabic captions and emoji
          // arrive as mojibake, which is most of what a caption column holds.
          write("﻿");
          write(`${CSV_HEADER.join(",")}\n`);
        } else {
          write(
            `{"exported_at":${JSON.stringify(exportedAt)},` +
              `"account":${JSON.stringify({
                username: account.ig_username,
                display_name: account.display_name,
                followers_count: account.followers_count,
              })},"reels":[`
          );
        }

        for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
          const { data, error } = await supabase
            .from("tracked_reels")
            .select(
              "ig_media_id, ig_permalink, caption, view_count, like_count, comment_count, posted_at, is_favorite, is_discarded, transcript_status"
            )
            .eq("user_id", user.id)
            .eq("account_id", account.id)
            .order("posted_at", { ascending: false, nullsFirst: false })
            // Stable tie-break: reels sharing a posted_at have no inherent order,
            // and an unstable one would duplicate some rows and drop others.
            .order("ig_media_id", { ascending: false })
            .range(offset, offset + PAGE - 1)
            .returns<ReelRow[]>();

          if (error) throw new Error(error.message);
          const rows = data ?? [];
          if (rows.length === 0) break;

          for (const row of rows) {
            if (format === "csv") {
              write(`${csvRow(row)}\n`);
            } else {
              write(`${rowsWritten > 0 ? "," : ""}${JSON.stringify(jsonRow(row))}`);
            }
            rowsWritten += 1;
          }

          if (rows.length < PAGE) break;
        }

        if (format === "json") {
          write(`],"count":${rowsWritten}}`);
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
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
