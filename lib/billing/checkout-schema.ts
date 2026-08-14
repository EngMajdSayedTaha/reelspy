// The request body shape shared by /api/billing/checkout and
// /api/billing/preview. They must agree exactly: preview is the read-only twin
// of checkout, so a body one accepts and the other rejects would quote the
// customer a price for a change they then can't make. Keeping one schema is what
// guarantees that, and it's the seam where a dynamic (admin-managed) plan
// catalog will replace the hardcoded tier list without touching either route.
//
// Pure + client-safe on purpose: no server-only imports, so the confirmation
// dialogs could type their request bodies against the same schema.

import { z } from "zod";
import { CUSTOM_PLAN_RANGE } from "@/lib/billing/custom-pricing";

// The custom ("build your own") slider config. Bounds mirror CUSTOM_PLAN_RANGE
// so an out-of-range request is rejected before it reaches the pricing math —
// which then re-clamps anyway (clampCustomConfig), because validation at the
// edge and clamping at the till are two different jobs.
export const customConfigSchema = z.object({
  accounts: z.number().int().min(CUSTOM_PLAN_RANGE.accounts.min).max(CUSTOM_PLAN_RANGE.accounts.max),
  scriptsUnlimited: z.boolean(),
  scripts: z.number().int().min(CUSTOM_PLAN_RANGE.scripts.min).max(CUSTOM_PLAN_RANGE.scripts.max),
  automations: z
    .number()
    .int()
    .min(CUSTOM_PLAN_RANGE.automations.min)
    .max(CUSTOM_PLAN_RANGE.automations.max),
  publishTargets: z
    .number()
    .int()
    .min(CUSTOM_PLAN_RANGE.publishTargets.min)
    .max(CUSTOM_PLAN_RANGE.publishTargets.max),
  model: z.enum(["sonnet", "opus"]),
});

// Plan slugs are admin-created, so the tier can't be a fixed enum any more —
// which also means this can't be a discriminated union (zod can't discriminate
// on a non-literal). The shape check here is only the first gate: the routes
// must additionally resolve the slug against the catalog and confirm the plan is
// published and sellable, because "looks like a slug" is not "is a real plan".
const SLUG_RE = /^[a-z][a-z0-9_-]{1,31}$/;

export const planSelectionSchema = z
  .object({
    tier: z.string().regex(SLUG_RE),
    config: customConfigSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // The build-your-own plan is the one selection that carries a configuration,
    // and it is meaningless without one.
    if (value.tier === "custom" && !value.config) {
      ctx.addIssue({
        code: "custom",
        path: ["config"],
        message: "The custom plan needs its configuration.",
      });
    }
  });

// The one message both routes give for a body they can't act on. Deliberately
// vague: the client already knows which plans exist, so a detailed validation
// error would only help someone probing the endpoint.
export const INVALID_PLAN_MESSAGE = "Pick a valid plan.";
