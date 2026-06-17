// Shared numeric env reader: returns the parsed value when it's a positive
// finite number, otherwise the fallback.
export function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Shared boolean env reader. Accepts 1/true/yes/on (any case) as true and
// 0/false/no/off as false; anything else (including unset) returns the fallback.
export function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}
