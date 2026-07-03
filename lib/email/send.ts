// Transactional email (L9 / B4). Thin wrapper over the Resend HTTP API — no SDK
// dependency, one fetch. Server-only.
//
// Fail-open by design: when RESEND_API_KEY / EMAIL_FROM aren't configured (or the
// send errors), `sendEmail` logs and returns false instead of throwing, so a
// publish flow can never be broken by a missing notification. The founder wires
// the keys when Resend is ready; until then emails silently no-op.

import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

// Returns true only when the provider accepted the message. Never throws.
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("[email] skipped — RESEND_API_KEY / EMAIL_FROM not set");
    return false;
  }
  if (!input.to) {
    console.warn("[email] skipped — no recipient");
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[email] send failed ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[email] send threw:", err instanceof Error ? err.message : err);
    return false;
  }
}
