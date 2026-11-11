export function parseMoneyValue(value: string): number {
  const raw = value.replace(/[€$,]/g, "").trim().toUpperCase();
  if (!raw) return 0;
  if (raw.endsWith("M")) return parseFloat(raw) * 1_000_000;
  if (raw.endsWith("K")) return parseFloat(raw) * 1_000;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoneyCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatNrrPercent(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`;
}
