// Per-page tour steps, triggered by the "?" button beside each dashboard
// page's <h1> (components/tour/PageTourButton.tsx). Same selector-based
// TourStep shape as the site-wide tour (lib/tour/steps.ts) — steps whose
// target isn't in the DOM are filtered out by AppTour's startPageTour.

import type { Dict } from "@/lib/i18n/dictionaries";
import type { TourStep } from "@/lib/tour/steps";

export type PageTourKey =
  | "dashboard"
  | "accounts"
  | "feed"
  | "trends"
  | "hooks"
  | "scripts"
  | "generate"
  | "myAccount"
  | "publishing"
  | "calendar"
  | "connections"
  | "billing"
  | "settings"
  | "automations";

export function buildPageTourSteps(page: PageTourKey, dict: Dict): TourStep[] {
  switch (page) {
    case "dashboard": {
      const s = dict.dashboard.pageTour.steps;
      return [
        { element: '[data-tour="setup-checklist"]', title: s.checklist.title, description: s.checklist.desc },
        { element: '[data-tour="quick-actions"]', title: s.quickActions.title, description: s.quickActions.desc },
        { element: '[data-tour="dashboard-stats"]', title: s.stats.title, description: s.stats.desc },
        { element: '[data-tour="suggested-accounts"]', title: s.suggested.title, description: s.suggested.desc },
      ];
    }
    case "accounts": {
      const s = dict.accounts.pageTour.steps;
      return [
        { element: '[data-tour="add-account"]', title: s.addAccount.title, description: s.addAccount.desc },
        { element: '[data-tour="import-following"]', title: s.importFollowing.title, description: s.importFollowing.desc },
        { element: '[data-tour="account-groups"]', title: s.groups.title, description: s.groups.desc },
        { element: '[data-tour="accounts-filter-bar"]', title: s.filterBar.title, description: s.filterBar.desc },
        { element: '[data-tour="account-cards"]', title: s.cards.title, description: s.cards.desc },
      ];
    }
    case "feed": {
      const s = dict.feed.pageTour.steps;
      return [
        { element: '[data-tour="sync-button"]', title: s.syncButton.title, description: s.syncButton.desc },
        { element: '[data-tour="rising-now"]', title: s.risingNow.title, description: s.risingNow.desc },
        { element: '[data-tour="feed-controls"]', title: s.feedControls.title, description: s.feedControls.desc },
        { element: '[data-tour="reel-feed"]', title: s.reelFeed.title, description: s.reelFeed.desc },
      ];
    }
    case "trends": {
      const s = dict.trends.pageTour.steps;
      return [
        { element: '[data-tour="niche-picker"]', title: s.nichePicker.title, description: s.nichePicker.desc },
        { element: '[data-tour="trend-reels"]', title: s.trendReels.title, description: s.trendReels.desc },
      ];
    }
    case "hooks": {
      const s = dict.hooks.pageTour.steps;
      return [
        { element: '[data-tour="saved-hooks"]', title: s.savedHooks.title, description: s.savedHooks.desc },
        { element: '[data-tour="hook-suggestions"]', title: s.suggestions.title, description: s.suggestions.desc },
      ];
    }
    case "scripts": {
      const s = dict.scripts.pageTour.steps;
      return [
        { element: '[data-tour="script-generator"]', title: s.generator.title, description: s.generator.desc },
        { element: '[data-tour="transcribe-link"]', title: s.transcribeLink.title, description: s.transcribeLink.desc },
        { element: '[data-tour="platform-tone"]', title: s.platformTone.title, description: s.platformTone.desc },
        { element: '[data-tour="script-history"]', title: s.history.title, description: s.history.desc },
        { element: '[data-tour="script-actions"]', title: s.actions.title, description: s.actions.desc },
      ];
    }
    case "generate": {
      const s = dict.scripts.generateTour.steps;
      return [
        { element: '[data-tour="source-reel"]', title: s.sourceReel.title, description: s.sourceReel.desc },
        { element: '[data-tour="transcript-panel"]', title: s.transcriptPanel.title, description: s.transcriptPanel.desc },
        { element: '[data-tour="transcript-toolbar"]', title: s.transcriptToolbar.title, description: s.transcriptToolbar.desc },
        { element: '[data-tour="script-generator"]', title: s.generator.title, description: s.generator.desc },
        { element: '[data-tour="grounded-badge"]', title: s.grounded.title, description: s.grounded.desc },
      ];
    }
    case "myAccount": {
      const s = dict.myAccount.pageTour.steps;
      return [
        { element: '[data-tour="profile-snapshot"]', title: s.snapshot.title, description: s.snapshot.desc },
        { element: '[data-tour="connection-actions"]', title: s.connectionActions.title, description: s.connectionActions.desc },
        { element: '[data-tour="growth-notes"]', title: s.growthNotes.title, description: s.growthNotes.desc },
        { element: '[data-tour="reels-insights"]', title: s.insights.title, description: s.insights.desc },
        { element: '[data-tour="export-filter"]', title: s.exportFilter.title, description: s.exportFilter.desc },
      ];
    }
    case "publishing": {
      const s = dict.publishing.pageTour.steps;
      return [
        { element: '[data-tour="connect-accounts"]', title: s.connectAccounts.title, description: s.connectAccounts.desc },
        { element: '[data-tour="needs-attention"]', title: s.needsAttention.title, description: s.needsAttention.desc },
        { element: '[data-tour="publish-composer"]', title: s.composer.title, description: s.composer.desc },
        { element: '[data-tour="publish-preview"]', title: s.preview.title, description: s.preview.desc },
        { element: '[data-tour="publish-history"]', title: s.history.title, description: s.history.desc },
      ];
    }
    case "calendar": {
      const s = dict.calendar.pageTour.steps;
      return [
        { element: '[data-tour="month-nav"]', title: s.monthNav.title, description: s.monthNav.desc },
        { element: '[data-tour="status-legend"]', title: s.statusLegend.title, description: s.statusLegend.desc },
        { element: '[data-tour="calendar-grid"]', title: s.grid.title, description: s.grid.desc },
        { element: '[data-tour="day-detail"]', title: s.dayDetail.title, description: s.dayDetail.desc },
        { element: '[data-tour="unscheduled-tray"]', title: s.unscheduledTray.title, description: s.unscheduledTray.desc },
      ];
    }
    case "connections": {
      const s = dict.connections.pageTour.steps;
      return [
        { element: '[data-tour="workspace-switcher"]', title: s.workspaceSwitcher.title, description: s.workspaceSwitcher.desc },
        { element: '[data-tour="ig-connection"]', title: s.igConnection.title, description: s.igConnection.desc },
        { element: '[data-tour="tiktok-connection"]', title: s.tiktokConnection.title, description: s.tiktokConnection.desc },
        { element: '[data-tour="youtube-connection"]', title: s.youtubeConnection.title, description: s.youtubeConnection.desc },
      ];
    }
    case "billing": {
      const s = dict.billing.pageTour.steps;
      return [
        { element: '[data-tour="plan-usage"]', title: s.planUsage.title, description: s.planUsage.desc },
        { element: '[data-tour="manage-billing"]', title: s.manageBilling.title, description: s.manageBilling.desc },
        { element: '[data-tour="plan-comparison"]', title: s.comparison.title, description: s.comparison.desc },
      ];
    }
    case "settings": {
      const s = dict.settings.pageTour.steps;
      return [
        { element: '[data-tour="preferences-form"]', title: s.preferences.title, description: s.preferences.desc },
        { element: '[data-tour="digest-toggle"]', title: s.digest.title, description: s.digest.desc },
        { element: '[data-tour="brand-voice"]', title: s.brandVoice.title, description: s.brandVoice.desc },
        { element: '[data-tour="connections-shortcut"]', title: s.connectionsShortcut.title, description: s.connectionsShortcut.desc },
        { element: '[data-tour="danger-zone"]', title: s.dangerZone.title, description: s.dangerZone.desc },
      ];
    }
    case "automations": {
      const s = dict.automations.pageTour.steps;
      return [
        { element: '[data-tour="platform-tabs"]', title: s.platformTabs.title, description: s.platformTabs.desc },
        { element: '[data-tour="ig-subtabs"]', title: s.igSubtabs.title, description: s.igSubtabs.desc },
        { element: '[data-tour="automation-form"]', title: s.form.title, description: s.form.desc },
        { element: '[data-tour="automation-cards"]', title: s.cards.title, description: s.cards.desc },
        { element: '[data-tour="activity-log"]', title: s.activityLog.title, description: s.activityLog.desc },
      ];
    }
    default:
      return [];
  }
}
