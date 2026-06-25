"use client";

import { useState, type ReactNode } from "react";
import { Camera, MessageCircleReply, MessagesSquare, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "warning" | "disconnected";

type AutomationsTabsProps = {
  igStatus: ConnectionStatus;
  ytStatus: ConnectionStatus;
  /** Connect / reconnect notice rendered at the top of the Instagram panel. */
  igBanner?: ReactNode;
  igComments: ReactNode;
  igDms: ReactNode;
  /** Connect / reconnect notice rendered at the top of the YouTube panel. */
  ytBanner?: ReactNode;
  youtube: ReactNode;
};

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-400",
  warning: "bg-amber-400",
  disconnected: "bg-subtle",
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  warning: "Needs attention",
  disconnected: "Not connected",
};

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span className="relative flex h-2 w-2" title={STATUS_LABEL[status]}>
      {status === "connected" ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
      ) : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", STATUS_DOT[status])} />
    </span>
  );
}

type Platform = "instagram" | "youtube";
type IgView = "comments" | "dms";

export function AutomationsTabs({
  igStatus,
  ytStatus,
  igBanner,
  igComments,
  igDms,
  ytBanner,
  youtube,
}: AutomationsTabsProps) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [igView, setIgView] = useState<IgView>("comments");

  const platforms: Array<{
    key: Platform;
    label: string;
    icon: typeof Camera;
    status: ConnectionStatus;
  }> = [
    { key: "instagram", label: "Instagram", icon: Camera, status: igStatus },
    { key: "youtube", label: "YouTube", icon: PlayCircle, status: ytStatus },
  ];

  return (
    <div className="space-y-6">
      {/* Platform switcher — a segmented control that keeps Instagram and
          YouTube automations on separate surfaces instead of one long page. */}
      <div
        role="tablist"
        aria-label="Automation platform"
        className="flex w-full gap-1 rounded-xl border border-border bg-card p-1 sm:w-auto sm:inline-flex"
      >
        {platforms.map((p) => {
          const Icon = p.icon;
          const active = platform === p.key;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPlatform(p.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none",
                active
                  ? "bg-primary/15 text-brand shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{p.label}</span>
              <StatusDot status={p.status} />
            </button>
          );
        })}
      </div>

      {platform === "instagram" ? (
        <section className="space-y-5">
          {igBanner}

          {/* Sub-tabs: comment-triggered auto-reply vs. DM-keyword auto-reply. */}
          <div role="tablist" aria-label="Instagram automation type" className="flex gap-6 border-b border-border">
            <SubTab
              active={igView === "comments"}
              onClick={() => setIgView("comments")}
              icon={<MessageCircleReply className="h-4 w-4" />}
              label="Comment Auto-Reply"
            />
            <SubTab
              active={igView === "dms"}
              onClick={() => setIgView("dms")}
              icon={<MessagesSquare className="h-4 w-4" />}
              label="DM Auto-Reply"
            />
          </div>

          <div className={igView === "comments" ? "block" : "hidden"}>{igComments}</div>
          <div className={igView === "dms" ? "block" : "hidden"}>{igDms}</div>
        </section>
      ) : (
        <section className="space-y-5">
          {ytBanner}
          {youtube}
        </section>
      )}
    </div>
  );
}

function SubTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition",
        active
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
