import { parseGenesisFunding, formatGenesisFunding } from './parseGenesisFunding';

test('parses BigInt genesis literals without rounding', () => {
  const raw = (2n ** 256n - 1n).toString();
  const entries = parseGenesisFunding(`match [("wallet", ${raw}n)]`, 'genesis', 0, 18);
  expect(entries).toHaveLength(1);
  expect(entries[0].amount_dust).toBe(raw);
  expect(entries[0].amount_asi.replace('.', '')).toBe(raw);
  expect(formatGenesisFunding(entries[0].amount_asi)).toContain(entries[0].amount_asi);
});

test('preserves historical eight-decimal genesis funding', () => {
  expect(parseGenesisFunding('match [("wallet", 123456789)]', 'genesis', 0)[0].amount_asi).toBe('1.23456789');
});
