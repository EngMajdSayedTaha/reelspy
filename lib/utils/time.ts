// Shared "mm:ss" / "Xh MMm" countdown formatter — used by every widget that
// counts down to a rate-limit reset (SyncStatus, SyncButton, AccountCard).
// Callers pass seconds derived from an absolute deadline and the current clock,
// never a counter they decrement themselves — see SyncStatus for why.
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
