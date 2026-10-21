// Older indexed rows and nodes without token metadata use eight decimals.
export const LEGACY_DECIMALS = 8;
export const MAX_DECIMALS = 77;
export const NATIVE_DECIMALS = validateDecimals(
  Number(process.env.REACT_APP_NATIVE_TOKEN_DECIMALS ?? LEGACY_DECIMALS)
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
