/**
 * Strips trailing zeros after the decimal point. Leaves digits intact;
 * does not change scale or use locale formatting. Safe for input fields
 * because it operates on the string representation.
 *
 *   "150.000000"  → "150"
 *   "150.50000"   → "150.5"
 *   "0.00100"     → "0.001"
 *   "150"         → "150"
 *   ".5"          → ".5"  (untouched)
 *   ""            → ""
 */
export function trimTrailingZeros(s: string | null | undefined): string {
  if (!s) return "";
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/**
 * Same as above but for a number — converts to string then trims. Use
 * for amounts coming straight from numeric DB columns or arithmetic.
 */
export function trimZerosNum(n: number, maxDigits = 8): string {
  if (!isFinite(n)) return "";
  return trimTrailingZeros(n.toFixed(maxDigits));
}
