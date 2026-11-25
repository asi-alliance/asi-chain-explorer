import {
  NATIVE_DECIMALS,
  compactDecimal,
  formatRaw,
  rawInteger,
  validateDecimals,
} from "./amounts";

export interface DeployFee {
  /** Exact charge in atomic units: phlo_cost * phlo_price. */
  dust: string;
  /** Exact decimal value in ASI. */
  asi: string;
  /** Grouped ASI value with the fraction cut to eight digits. */
  display: string;
}

const FEE_FRACTION_DIGITS = 8;

/**
 * Converts a deploy's phlo usage into the charged ASI amount. The node charges
 * `cost * phlo_price` atomic units, refunding the `phlo_limit` precharge down
 * to the final cost, so `phlo_cost` is already the executed cost.
 */
export function deployFee(
  phloCost: unknown,
  phloPrice: unknown,
  decimals: number = NATIVE_DECIMALS
): DeployFee | null {
  try {
    validateDecimals(decimals);
    if (phloCost === null || phloCost === undefined) return null;
    if (phloPrice === null || phloPrice === undefined) return null;

    const dust = rawInteger(phloCost) * rawInteger(phloPrice);
    const asi = formatRaw(dust, decimals);
    return {
      dust: dust.toString(),
      asi,
      display: compactDecimal(asi, FEE_FRACTION_DIGITS),
    };
  } catch {
    return null;
  }
}
