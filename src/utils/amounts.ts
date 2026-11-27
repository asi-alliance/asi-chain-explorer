// Older indexed rows and nodes without token metadata use eight decimals.
export const LEGACY_DECIMALS = 8;
export const MAX_DECIMALS = 77;
export const NATIVE_DECIMALS = validateDecimals(
  Number(process.env.REACT_APP_NATIVE_TOKEN_DECIMALS ?? 18)
);

export function validateDecimals(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_DECIMALS) {
    throw new Error("Invalid token decimals");
  }
  return value;
}

export function rawInteger(value: unknown): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error("Unsafe integer from API");
  }
  if (!["string", "number", "bigint"].includes(typeof value)) {
    throw new Error("Invalid raw amount");
  }
  const text = String(value);
  if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error("Invalid raw amount");
  return BigInt(text);
}

export function formatRaw(value: unknown, decimals = LEGACY_DECIMALS): string {
  validateDecimals(decimals);
  const text = rawInteger(value).toString().padStart(decimals + 1, "0");
  if (!decimals) return text;
  const fraction = text.slice(-decimals).replace(/0+$/, "");
  return text.slice(0, -decimals) + (fraction ? "." + fraction : "");
}

/** Groups the integer part of an exact decimal for display; the value is unchanged. */
export function groupThousands(text: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * Cuts the fraction to at most `decimals` digits without rounding, so a shown
 * balance never claims more funds than the account holds. Trailing zeros are
 * removed; the untouched value stays available for a tooltip.
 */
export function truncateDecimal(text: string, decimals = 8): string {
  validateDecimals(decimals);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  const [whole, fraction = ''] = text.split('.');
  const kept = fraction.slice(0, decimals).replace(/0+$/, '');
  return kept ? `${whole}.${kept}` : whole;
}

/**
 * Cuts the displayed fraction without rounding up. A positive amount smaller
 * than the display precision is shown as a less-than value instead of `0`.
 */
export function compactDecimal(text: string, decimals = 8): string {
  validateDecimals(decimals);
  const exact = decimalText(text);
  const display = truncateDecimal(exact, decimals);
  if (display !== '0') return groupThousands(display);
  if (!/[1-9]/.test(exact)) return '0';
  return decimals > 0 ? `<0.${'0'.repeat(decimals - 1)}1` : '<1';
}

export function decimalText(value: unknown): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error("Decimal amounts must use strings");
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Invalid decimal amount");
  }
  const text = String(value);
  if (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error("Invalid decimal amount");
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

// Aggregate in a common exact scale, independent of the current chain profile.
export function decimalRaw(value: unknown, decimals = MAX_DECIMALS): bigint {
  validateDecimals(decimals);
  const [whole, fraction = ""] = decimalText(value).split(".");
  if (fraction.length > decimals) throw new Error("Amount precision exceeds configured decimals");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function percentage(value: bigint, total: bigint): string {
  return total === 0n ? "0" : formatRaw(value * 10000n / total, 2);
}

export function normalizedRaw(value: unknown, decimals = LEGACY_DECIMALS): bigint {
  validateDecimals(decimals);
  return rawInteger(value) * 10n ** BigInt(MAX_DECIMALS - decimals);
}
