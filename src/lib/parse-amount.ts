/**
 * Tolerant amount parser for user-entered or imported CSV values.
 *
 * Recognises every common format an exchange operator might paste:
 *   "1234.56"     → 1234.56  (US/UK plain)
 *   "1234,56"     → 1234.56  (EU plain)
 *   "1,234.56"    → 1234.56  (US thousand-separator)
 *   "1.234,56"    → 1234.56  (DE/CZ thousand-separator)
 *   "1 234,56"    → 1234.56  (FR thousand-separator with space)
 *   "1 234.56"    → 1234.56  (mixed)
 *   "1'234.56"    → 1234.56  (CH thousand-separator with apostrophe)
 *
 * Algorithm: when both `,` and `.` appear, the LAST one is the decimal
 * separator and the others are thousand separators. When only one appears,
 * we trust it as the decimal separator (a single grouping symbol is rare in
 * practice and impossible to disambiguate from a decimal anyway).
 *
 * Returns NaN for unparseable input so callers can detect failure.
 */
export function parseAmount(input: string | number | null | undefined): number {
  if (input == null) return NaN;
  if (typeof input === "number") return input;
  let s = String(input).trim();
  if (!s) return NaN;
  // Strip ASCII spaces, non-breaking spaces (U+00A0, U+202F), and Swiss apostrophe
  s = s.replace(/[\s  ']/g, "");
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = s;
  } else if (lastComma === -1) {
    normalized = s; // only dots — already JS-friendly
  } else if (lastDot === -1) {
    normalized = s.replace(/,/g, ".");
  } else if (lastComma > lastDot) {
    // Comma is decimal: dots are thousand separators.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is decimal: commas are thousand separators.
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parse and return as a non-scientific decimal string suitable for Drizzle
 * numeric(28,10). Returns null for invalid input (caller should treat as error).
 */
export function parseAmountToString(input: string | number | null | undefined): string | null {
  const n = parseAmount(input);
  if (!Number.isFinite(n)) return null;
  // Avoid scientific notation by formatting with up to 10 fractional digits,
  // then trim trailing zeros.
  if (n === 0) return "0";
  if (Math.abs(n) >= 1e15) return n.toString(); // very large; leave as-is
  const formatted = n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return formatted;
}
