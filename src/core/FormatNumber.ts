const COMPACT_SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'Ud',
  'Dd',
] as const;

/**
 * Formats numbers with >3 digits (>= 1,000) using truncated 1-decimal compact suffixes:
 * e.g. 999 -> "999", 1000 -> "1.0K", 1550 -> "1.5K", 1_000_000 -> "1.0M", etc.
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1000) {
    return `${sign}${Math.floor(abs)}`;
  }

  const tier = Math.floor(Math.log10(abs) / 3);
  if (tier >= COMPACT_SUFFIXES.length) {
    return `${sign}${abs.toExponential(1).replace('+', '')}`;
  }

  const scale = Math.pow(10, tier * 3);
  const truncated = Math.floor((abs / scale) * 10 + 1e-9) / 10;
  // Handle floating point edge case where 999.9999 becomes 1000.0 at current tier
  if (truncated >= 1000 && tier + 1 < COMPACT_SUFFIXES.length) {
    return `${sign}1.0${COMPACT_SUFFIXES[tier + 1]}`;
  }
  return `${sign}${truncated.toFixed(1)}${COMPACT_SUFFIXES[tier]}`;
}
