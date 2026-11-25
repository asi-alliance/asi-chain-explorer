import { formatLocalTime, formatRelativeTime, toMillis } from './time';

const now = Date.UTC(2026, 10, 25, 12, 0, 0);
const ago = (milliseconds: number) => now - milliseconds;

test('reads epoch seconds, epoch milliseconds, ISO strings and zones', () => {
  expect(toMillis('1559156071321')).toBe(1559156071321);
  expect(toMillis('1559156071')).toBe(1559156071000);
  expect(toMillis('2026-11-10T00:00:00')).toBe(Date.UTC(2026, 10, 10));
  expect(toMillis('2026-11-10T00:00:00.350416Z')).toBe(Date.UTC(2026, 10, 10, 0, 0, 0, 350));
  expect(toMillis('2026-11-10T00:00:00+03:00')).toBe(Date.UTC(2026, 10, 9, 21));
  expect(toMillis(new Date(now))).toBe(now);
  expect(toMillis('')).toBeNaN();
  expect(toMillis('not a date')).toBeNaN();
});

test('uses a just-now bucket below twenty seconds', () => {
  expect(formatRelativeTime(ago(0), now)).toBe('just now');
  expect(formatRelativeTime(ago(19_999), now)).toBe('just now');
  expect(formatRelativeTime(now + 10_000, now)).toBe('just now');
});

test('uses a minute-ago bucket from twenty to sixty seconds', () => {
  expect(formatRelativeTime(ago(20_000), now)).toBe('a minute ago');
  expect(formatRelativeTime(ago(59_000), now)).toBe('a minute ago');
});

test('falls back to date-fns from one minute onward', () => {
  expect(formatRelativeTime(ago(60_000), now)).toBe('1 minute ago');
  expect(formatRelativeTime(ago(120_000), now)).toBe('2 minutes ago');
  expect(formatRelativeTime(ago(7 * 365 * 24 * 60 * 60 * 1000), now)).toMatch(/years? ago$/);
});

test('formats absolute timestamps in the local zone', () => {
  const formatted = formatLocalTime('1559156071321');
  expect(formatted).toContain('2019');
  expect(formatted).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  expect(formatLocalTime('not a date')).toBe('Unknown time');
});
