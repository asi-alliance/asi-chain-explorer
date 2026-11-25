import { deployFee } from './deployFee';

test('converts an executed phlo cost into ASI with the block decimals', () => {
  const fee = deployFee('277155', '100000000000', 18);
  expect(fee).toEqual({
    dust: '27715500000000000',
    asi: '0.0277155',
    display: '0.0277155',
  });
});

test('keeps legacy eight-decimal networks exact', () => {
  expect(deployFee('1000000', '1', 8)).toEqual({
    dust: '1000000',
    asi: '0.01',
    display: '0.01',
  });
});

test('groups large fees and cuts only the fraction for display', () => {
  const fee = deployFee('1234567', '1000000000000', 18);
  expect(fee?.asi).toBe('1.234567');
  expect(deployFee('5000000', '1000000000000', 18)?.asi).toBe('5');
  expect(deployFee('2000000', '1000000000000', 18)?.display).toBe('2');
});

test('returns null when either phlo value is missing or malformed', () => {
  expect(deployFee(null, '1', 18)).toBeNull();
  expect(deployFee('1', undefined, 18)).toBeNull();
  expect(deployFee('abc', '1', 18)).toBeNull();
  expect(deployFee('-1', '1', 18)).toBeNull();
  expect(deployFee('1', '1', 99)).toBeNull();
});

test('shows a zero fee as zero instead of hiding the row', () => {
  expect(deployFee('0', '100000000000', 18)?.display).toBe('0');
});
