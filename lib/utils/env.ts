// Shared numeric env reader: returns the parsed value when it's a positive
// finite number, otherwise the fallback.
export function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
