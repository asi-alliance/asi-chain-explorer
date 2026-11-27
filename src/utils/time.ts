import { formatDistance } from 'date-fns';

const JUST_NOW_MS = 20_000;
const A_MINUTE_MS = 60_000;
const LOCAL_TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long' });

/**
 * Normalize epoch seconds, epoch milliseconds, ISO strings and Date objects to
 * milliseconds. Indexer timestamps without a zone are UTC.
 */
export function toMillis(input: string | number | Date | null | undefined): number {
  if (input == null) return NaN;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') {
    return Number.isFinite(input) ? (input > 1e12 ? input : input * 1000) : NaN;
  }

  const value = input.trim();
  if (!value) return NaN;
  if (/^\d+$/.test(value)) {
    const secondsOrMillis = Number(value);
    if (!Number.isFinite(secondsOrMillis)) return NaN;
    return secondsOrMillis > 1e12 ? secondsOrMillis : secondsOrMillis * 1000;
  }

  const normalized = value.replace(/(\.\d{3})\d+/, '$1');
  const hasTime = /[T ]\d{2}:\d{2}/.test(normalized);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = Date.parse(hasTime && !hasZone ? `${normalized}Z` : normalized);
  return Number.isNaN(parsed) ? NaN : parsed;
}

/** Relative time with an explicit fresh bucket instead of date-fns' "less than a minute". */
export function formatRelativeTime(
  input: string | number | Date | null | undefined,
  now = Date.now()
): string {
  const time = toMillis(input);
  if (!Number.isFinite(time)) return 'Unknown time';

  const diff = now - time;
  if (Math.abs(diff) < JUST_NOW_MS) return 'just now';
  if (diff >= JUST_NOW_MS && diff < A_MINUTE_MS) return 'a minute ago';
  return formatDistance(new Date(time), new Date(now), { addSuffix: true });
}

/** Absolute timestamp in the browser's local timezone, including its zone. */
export function formatLocalTime(input: string | number | Date | null | undefined): string {
  const time = toMillis(input);
  if (!Number.isFinite(time)) return 'Unknown time';
  return LOCAL_TIME.format(new Date(time));
}
