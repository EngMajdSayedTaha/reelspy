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

export const planSelectionSchema = z.discriminatedUnion("tier", [
  z.object({ tier: z.enum(["creator", "pro", "studio"]) }),
  z.object({ tier: z.literal("custom"), config: customConfigSchema }),
]);

export type PlanSelection = z.infer<typeof planSelectionSchema>;

// The one message both routes give for a body they can't act on. Deliberately
// vague: the client already knows which plans exist, so a detailed validation
// error would only help someone probing the endpoint.
export const INVALID_PLAN_MESSAGE = "Pick a valid plan.";
