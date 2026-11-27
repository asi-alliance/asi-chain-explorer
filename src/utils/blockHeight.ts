import { rawInteger } from './amounts';

// Hasura exposes PostgreSQL bigint heights; with HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES
// they arrive as decimal strings, so they must never be compared as strings or Numbers.
export const MAX_BLOCK_HEIGHT = 9223372036854775807n;

/** Exact height from an API value, or null for malformed/unsafe values (never a guessed height). */
export function blockHeight(value: unknown): bigint | null {
  try {
    const height = rawInteger(value);
    return height <= MAX_BLOCK_HEIGHT ? height : null;
  } catch {
    return null;
  }
}

/** True when `candidate` is a valid height above `current`; any valid height replaces an invalid one. */
export function isNewerHeight(candidate: unknown, current: unknown): boolean {
  const next = blockHeight(candidate);
  if (next === null) return false;
  const previous = blockHeight(current);
  return previous === null || next > previous;
}

/** Display label for an API height; malformed values are not shown as a block number. */
export function heightLabel(value: unknown, missing = '--'): string {
  if (value === null || value === undefined) return missing;
  const height = blockHeight(value);
  return height === null ? 'Invalid height' : `#${height}`;
}

/** Canonical height for user-entered text, or null when it is not a supported plain decimal height. */
export function heightInput(text: string): string | null {
  if (!/^\d+$/.test(text)) return null;
  const height = BigInt(text);
  return height <= MAX_BLOCK_HEIGHT ? height.toString() : null;
}
