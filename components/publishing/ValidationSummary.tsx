"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { PLATFORM_ICONS } from "@/components/publishing/platform-icons";
import { PLATFORM_LABELS } from "@/lib/publishing/types";
import type { Issue } from "@/lib/publishing/validate";
import { useDict } from "@/lib/i18n/I18nProvider";

type Props = {
  errors: Issue[];
  warnings: Issue[];
  /** Hide the "all clear" state until the user has actually built something. */
  ready: boolean;
};

/**
 * Everything blocking the post, in one place.
 *
 * The composer's Post button is disabled whenever `errors` is non-empty, and a
 * disabled button with no explanation is the single most common way a composer
 * wastes someone's afternoon. Each line names the platform and what to do about
 * it ("Instagram takes 10 slides — remove 2, or unselect Instagram"), never just
 * that something is wrong.
 */
export function ValidationSummary({ errors, warnings, ready }: Props) {
  const t = useDict().publishing;

  if (errors.length === 0 && warnings.length === 0) {
    if (!ready) return null;
    return (
      <p
        data-tour="publish-validation"
        className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-xs text-success"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {t.validation.allClear}
      </p>
    );
  }

  return (
    <div data-tour="publish-validation" className="space-y-2">
      {errors.length > 0 ? (
        <IssueList
          title={t.validation.errorsTitle}
          issues={errors}
          tone="danger"
          icon={<XCircle className="h-4 w-4 shrink-0 text-danger" />}
        />
      ) : null}
      {warnings.length > 0 ? (
        <IssueList
          title={t.validation.warningsTitle}
          issues={warnings}
          tone="warning"
          icon={<AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
        />
      ) : null}
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
  icon,
}: {
  title: string;
  issues: Issue[];
  tone: "danger" | "warning";
  icon: React.ReactNode;
}) {
  const t = useDict().publishing;
  const border = tone === "danger" ? "border-danger/40 bg-danger/10" : "border-warning/40 bg-warning/10";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <p className="flex items-center gap-2 text-xs font-medium text-foreground">
        {icon}
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {issues.map((issue, index) => {
          const Icon = issue.platform ? PLATFORM_ICONS[issue.platform] : null;
          return (
            <li
              key={`${issue.code}-${issue.platform ?? "post"}-${index}`}
              className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"
            >
              {Icon ? (
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-label={PLATFORM_LABELS[issue.platform!]}
                />
              ) : (
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              )}
              <span>{t.validation.message(issue)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
