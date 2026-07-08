"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { postJson } from "@/components/billing/BillingActions";
import { useDict } from "@/lib/i18n/I18nProvider";
import {
  CUSTOM_PLAN_RANGE,
  DEFAULT_CUSTOM_CONFIG,
  computeCustomPriceAed,
  type CustomPlanConfig,
} from "@/lib/billing/custom-pricing";

// The dynamic "build your own plan" card (B4): live-priced sliders that post
// straight to the same checkout endpoint SubscribeButton uses, just with
// tier: "custom" + the chosen config. The server (app/api/billing/checkout)
// recomputes the price and entitlements from this same config — this preview
// is purely so the user sees the number move before they commit.
export function DynamicPlanCard({ disabled }: { disabled?: boolean }) {
  const dict = useDict();
  const t = dict.billing.customPlan;
  const [config, setConfig] = useState<CustomPlanConfig>(DEFAULT_CUSTOM_CONFIG);
  const [loading, setLoading] = useState(false);

  const price = useMemo(() => computeCustomPriceAed(config), [config]);

  function update<K extends keyof CustomPlanConfig>(key: K, value: CustomPlanConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function subscribe() {
    setLoading(true);
    const { url, error } = await postJson("/api/billing/checkout", dict.common.unknownError, {
      tier: "custom",
      config,
    });
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error(error ?? dict.billing.couldNotStartCheckout);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.heading}</CardTitle>
        <CardDescription>{t.subheading}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <SliderField
            label={t.trackedAccounts}
            value={config.accounts}
            range={CUSTOM_PLAN_RANGE.accounts}
            onChange={(v) => update("accounts", v)}
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{t.scriptsPerMonth}</span>
              <span className="text-muted-foreground">
                {config.scriptsUnlimited ? t.unlimitedScripts : config.scripts}
              </span>
            </div>
            <Slider
              min={CUSTOM_PLAN_RANGE.scripts.min}
              max={CUSTOM_PLAN_RANGE.scripts.max}
              step={CUSTOM_PLAN_RANGE.scripts.step}
              value={config.scripts}
              disabled={config.scriptsUnlimited}
              onChange={(e) => update("scripts", Number(e.target.value))}
            />
            <label className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={config.scriptsUnlimited}
                onChange={(e) => update("scriptsUnlimited", e.target.checked)}
                className="size-3.5 rounded border-border accent-primary"
              />
              {t.unlimitedScripts}
            </label>
          </div>

          <SliderField
            label={t.autoReplies}
            value={config.automations}
            range={CUSTOM_PLAN_RANGE.automations}
            onChange={(v) => update("automations", v)}
          />

          <SliderField
            label={t.publishTargets}
            value={config.publishTargets}
            range={CUSTOM_PLAN_RANGE.publishTargets}
            onChange={(v) => update("publishTargets", v)}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm text-foreground">{t.aiModel}</span>
          <div className="grid grid-cols-2 gap-2">
            <ModelOption
              selected={config.model === "sonnet"}
              label={t.modelSonnet}
              hint={t.modelSonnetHint}
              onClick={() => update("model", "sonnet")}
            />
            <ModelOption
              selected={config.model === "opus"}
              label={t.modelOpus}
              hint={t.modelOpusHint}
              onClick={() => update("model", "opus")}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">{t.estimatedPrice}</p>
            <p className="text-2xl font-semibold text-foreground">
              AED {price}
              <span className="text-sm font-normal text-muted-foreground">
                {dict.billing.perMonthSuffix}
              </span>
            </p>
          </div>
          <Button onClick={subscribe} disabled={disabled || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.subscribeCustom}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SliderField({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ModelOption({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}
