import { formatSignedRaw, lifecycleStatusView, splitByRole, NativeTransferOutcome } from './nativeTransfers';

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

test('separates calls started by a deploy from calls it completes', () => {
  const row = (call_id: string, initiation_deploy_id: string, completion_deploy_id: string | null) =>
    ({ call_id, initiation_deploy_id, completion_deploy_id } as NativeTransferOutcome);
  const rows = [row('a', 'd1', null), row('b', 'd1', 'd2'), row('c', 'd0', 'd1'), row('d', 'd1', 'd1')];
  const { initiated, completedHere } = splitByRole(rows, 'd1');
  expect(initiated.map((r) => r.call_id)).toEqual(['a', 'b', 'd']);
  expect(completedHere.map((r) => r.call_id)).toEqual(['c']);
});
