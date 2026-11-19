import { formatSignedRaw, lifecycleStatusView } from './nativeTransfers';

test.each([
  ['pending', 'Pending', 'text-warning'],
  ['completed', 'Completed', 'text-success'],
  ['rejected', 'Rejected', 'text-error'],
  ['coalesced', 'Coalesced', 'text-muted'],
  ['future_state', 'future_state', 'text-muted'],
  [null, 'Unknown', 'text-muted'],
  ['toString', 'toString', 'text-muted'],
])('maps lifecycle status %p (issue #71)', (status, label, className) => {
  expect(lifecycleStatusView(status)).toEqual({ label, className });
});

test('formats signed raw requested amounts exactly', () => {
  expect(formatSignedRaw('7', 18)).toBe('0.000000000000000007');
  expect(formatSignedRaw('-5', 0)).toBe('-5');
  expect(formatSignedRaw('-150000000', 8)).toBe('-1.5');
  expect(formatSignedRaw('1000000000000000000000000000007', 18)).toBe('1000000000000.000000000000000007');
  const max = (2n ** 256n - 1n).toString();
  expect(formatSignedRaw(max, 0)).toBe(max);
});

test.each([
  ['1.5', 18], ['-0', 18], ['+5', 18], ['0x10', 18], ['007', 18], ['', 18], [5, 18], ['5', 78], ['5', 1.5], ['5', null],
])('does not format %p with decimals %p', (value, decimals) => {
  expect(formatSignedRaw(value, decimals)).toBeNull();
});
