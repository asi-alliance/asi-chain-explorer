import { deployTime, pendingDeployStatus, truncatedTotal } from './pendingDeploys';

test('derives pending deploy status from inclusion and the rejected-recovery flag (issue #70)', () => {
  expect(pendingDeployStatus({ is_rejected: false, included_deployment: null }).state).toBe('pending');
  expect(pendingDeployStatus({ is_rejected: true, included_deployment: null }).state).toBe('retrying');
  expect(pendingDeployStatus({
    is_rejected: true,
    included_deployment: { deploy_id: 'sig', block_number: '7', block_hash: 'aa' },
  }).state).toBe('included');
});

test('reads millisecond timestamps from bigint strings and rejects malformed values', () => {
  expect(deployTime('1762770000000')?.toISOString()).toBe('2025-11-10T10:20:00.000Z');
  expect(deployTime(1762770000000)?.getTime()).toBe(1762770000000);
  for (const value of [null, undefined, '', '0', '-1', '1e12', '1.5', 'abc', '99999999999999999999']) {
    expect(deployTime(value)).toBeNull();
  }
});

test('reports a truncated pending list only when the node total exceeds the stored rows', () => {
  expect(truncatedTotal(1000, '1500')).toBe(1500);
  expect(truncatedTotal(1000, '1000')).toBeNull();
  expect(truncatedTotal(3, undefined)).toBeNull();
  expect(truncatedTotal(undefined, '10')).toBeNull();
});
