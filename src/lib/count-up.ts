export interface CountParts {
  prefix: string;
  target: number;
  suffix: string;
}

/** Splits a display figure like "₦25M+" or "5,000+" around its number, or null when it has none. */
export function parseCount(text: string): CountParts | null {
  const match = /^(\D*)(\d[\d,]*)(.*)$/.exec(text);
  if (!match) return null;
  const target = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(target)) return null;
  return { prefix: match[1], target, suffix: match[3] };
}

/** The figure at `progress` (0–1), eased out so it slows into the final value. */
export function countAt(parts: CountParts, progress: number): string {
  const p = Math.min(1, Math.max(0, progress));
  const value = Math.round(parts.target * (1 - (1 - p) ** 3));
  return `${parts.prefix}${value.toLocaleString("en-US")}${parts.suffix}`;
}
