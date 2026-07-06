// Composed translation dictionary. Each domain (shell, common, accounts,
// feed, …) owns one file exporting `{ <domainKey>Ex1: {...} }`-shaped en/ar
// objects under a single top-level namespace (e.g. `{ accounts: {...} }`);
// this file merges every domain's `en` into the canonical `Dict` shape and
// every domain's `ar` into a same-shaped object. Because `Dict` is inferred
// from the merged English object, a missing/renamed key in any locale is a
// compile error, not a silent English fallback — add a new domain by adding
// one line to each of the three spreads below.

import type { Locale } from "@/lib/i18n/config";
import { shellEn, shellAr } from "./shell";
import { commonEn, commonAr } from "./common";
import { accountsEn, accountsAr } from "./accounts";
import { automationsEn, automationsAr } from "./automations";
import { authEn, authAr } from "./auth";
import { billingEn, billingAr } from "./billing";
import { calendarEn, calendarAr } from "./calendar";
import { connectionsEn, connectionsAr } from "./connections";
import { dashboardEn, dashboardAr } from "./dashboard";
import { errorsEn, errorsAr } from "./errors";
import { feedEn, feedAr } from "./feed";
import { hooksEn, hooksAr } from "./hooks";
import { legalEn, legalAr } from "./legal";
import { myAccountEn, myAccountAr } from "./myAccount";
import { onboardingEn, onboardingAr } from "./onboarding";
import { publishingEn, publishingAr } from "./publishing";
import { quizEn, quizAr } from "./quiz";
import { scriptsEn, scriptsAr } from "./scripts";
import { settingsEn, settingsAr } from "./settings";
import { suggestionsEn, suggestionsAr } from "./suggestions";
import { themeEn, themeAr } from "./theme";
import { tourEn, tourAr } from "./tour";
import { trendsEn, trendsAr } from "./trends";

const en = {
  ...shellEn,
  ...commonEn,
  ...accountsEn,
  ...automationsEn,
  ...authEn,
  ...billingEn,
  ...calendarEn,
  ...connectionsEn,
  ...dashboardEn,
  ...errorsEn,
  ...feedEn,
  ...hooksEn,
  ...legalEn,
  ...myAccountEn,
  ...onboardingEn,
  ...publishingEn,
  ...quizEn,
  ...scriptsEn,
  ...settingsEn,
  ...suggestionsEn,
  ...themeEn,
  ...tourEn,
  ...trendsEn,
};

export type Dict = typeof en;

const ar: Dict = {
  ...shellAr,
  ...commonAr,
  ...accountsAr,
  ...automationsAr,
  ...authAr,
  ...billingAr,
  ...calendarAr,
  ...connectionsAr,
  ...dashboardAr,
  ...errorsAr,
  ...feedAr,
  ...hooksAr,
  ...legalAr,
  ...myAccountAr,
  ...onboardingAr,
  ...publishingAr,
  ...quizAr,
  ...scriptsAr,
  ...settingsAr,
  ...suggestionsAr,
  ...themeAr,
  ...tourAr,
  ...trendsAr,
};

const DICTIONARIES: Record<Locale, Dict> = { en, ar };

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? en;
}
