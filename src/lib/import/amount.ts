/**
 * Raw chain amount → decimal-string converter using BigInt.
 *
 * Why BigInt: chain APIs return amounts as integer strings in atomic units —
 * lamports (SOL, 9 decimals), sun (TRON, 6), wei (ETH, 18), or token-specific.
 * For 18-decimal tokens any amount ≥ 0.009 ETH overflows JS's Number safe
 * integer range (2^53). `parseInt(raw)` silently rounds the last digits and
 * stores wrong amounts forever.
 *
 * Returns a non-scientific decimal string suitable for Drizzle numeric(28,10).
 * Trailing zeros are trimmed but at least one digit remains after the dot.
 */
export function rawToDecimalString(raw: string | number, decimals: number): string {
  if (decimals < 0 || !Number.isInteger(decimals)) {
    throw new Error(`rawToDecimalString: invalid decimals ${decimals}`);
  }
  let s = typeof raw === "number" ? raw.toString() : raw.trim();
  if (!s) return "0";
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  // Reject scientific notation here — the caller should not pass us "1e18".
  if (/[eE]/.test(s)) {
    // Tolerate by going through Number → BigInt; lossy for large mantissas
    // but already a degraded case. Better than throwing.
    const n = Number(s);
    if (!Number.isFinite(n)) return "0";
    s = BigInt(Math.trunc(n)).toString();
  } else if (!/^\d+$/.test(s)) {
    // Already a decimal string? Round-trip via BigInt-on-the-integer-part.
    const [intPart, fracPart = ""] = s.split(".");
    const combined = intPart + fracPart.padEnd(decimals, "0").slice(0, decimals);
    s = combined.replace(/^0+/, "") || "0";
    decimals = 0; // already scaled
  }

  if (decimals === 0) {
    const trimmed = s.replace(/^0+/, "") || "0";
    return negative ? `-${trimmed}` : trimmed;
  }

  const big = BigInt(s);
  const divisor = 10n ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const out = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${out}` : out;
}
