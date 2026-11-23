import { decimalRaw, decimalText, formatRaw, groupThousands, normalizedRaw, rawInteger, percentage, truncateDecimal } from './amounts';

test('keeps raw units exact through display and parsing', () => {
  for (const raw of [2n**53n+1n, 2n**63n, 2n**128n, 2n**256n-1n]) {
    expect(decimalRaw(formatRaw(raw, 18), 18)).toBe(raw);
  }
  expect(formatRaw('1000000000000000001', 18)).toBe('1.000000000000000001');
  expect(() => rawInteger(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  expect(() => decimalRaw('0.0000000000000000001', 18)).toThrow();
});

test('compares historical and new precision without reinterpreting raw units', () => {
  expect(normalizedRaw('100000000', 8)).toBe(normalizedRaw('1000000000000000000', 18));
  expect(formatRaw(normalizedRaw('123456789', 8) + normalizedRaw('1', 18), 77)).toBe('1.234567890000000001');
  expect(percentage(2n**130n, 2n**132n)).toBe('25');
  expect(decimalText('12345678901234567890.000100')).toBe('12345678901234567890.0001');
});

test.each([null, undefined, true, -1, 0.5, '01', '1e18', '-1'])('rejects malformed raw amount %p', value => {
  expect(() => rawInteger(value)).toThrow();
});

test('preserves the smallest units and aggregates beyond uint256', () => {
  expect(decimalRaw('0.' + '0'.repeat(76) + '1')).toBe(1n);
  expect(formatRaw(decimalRaw('1.23456789') + decimalRaw('0.000000000000000001'), 77)).toBe('1.234567890000000001');
  const total = 2n * (2n ** 256n - 1n);
  expect(decimalRaw(formatRaw(total, 18), 18)).toBe(total);
  expect(formatRaw('100000000')).toBe('1');
  expect(percentage(1n, 3n)).toBe('33.33');
  expect(percentage(0n, 0n)).toBe('0');
});

test('groups thousands without changing the exact value', () => {
  expect(groupThousands('10000')).toBe('10,000');
  expect(groupThousands('20001.000000000000000001')).toBe('20,001.000000000000000001');
  expect(groupThousands('0.000000000000000001')).toBe('0.000000000000000001');
  expect(groupThousands('12345678901234567890')).toBe('12,345,678,901,234,567,890');
  expect(groupThousands('not a number')).toBe('not a number');
});

test('cuts the displayed fraction without rounding up', () => {
  expect(truncateDecimal('899999.999999999998091895')).toBe('899999.99999999');
  expect(truncateDecimal('1.000000001')).toBe('1');
  expect(truncateDecimal('1.2345678901')).toBe('1.23456789');
  expect(truncateDecimal('42')).toBe('42');
  expect(truncateDecimal('0.000000000000000001')).toBe('0');
  expect(truncateDecimal('1.234', 2)).toBe('1.23');
  expect(truncateDecimal('not a number')).toBe('not a number');
});

test.each([-1, 78, 1.5, NaN])('rejects invalid decimal precision %p', decimals => {
  expect(() => formatRaw('1', decimals)).toThrow();
  expect(() => normalizedRaw('1', decimals)).toThrow();
  expect(() => decimalRaw('1', decimals)).toThrow();
});
