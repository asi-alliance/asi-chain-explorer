import { decimalRaw, decimalText, formatRaw, normalizedRaw, rawInteger, percentage } from './amounts';

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

test.each([-1, 78, 1.5, NaN])('rejects invalid decimal precision %p', decimals => {
  expect(() => formatRaw('1', decimals)).toThrow();
  expect(() => normalizedRaw('1', decimals)).toThrow();
  expect(() => decimalRaw('1', decimals)).toThrow();
});
