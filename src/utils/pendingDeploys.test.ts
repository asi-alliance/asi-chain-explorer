import { deployTime, pendingDeployStatus, snapshotTime, staleSnapshotAge, truncatedTotal } from './pendingDeploys';

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

test('reads the zone-less snapshot time as UTC', () => {
  expect(snapshotTime('2026-11-11T00:00:00.123456')?.toISOString()).toBe('2026-11-11T00:00:00.123Z');
  expect(snapshotTime('2026-11-11 00:00:00')?.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  expect(snapshotTime('2026-11-11T03:00:00+03:00')?.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  for (const value of [null, undefined, '', 'yesterday', 42]) {
    expect(snapshotTime(value)).toBeNull();
  }
});

test('reports the snapshot age only after the stale threshold', () => {
  const fetched = Date.parse('2026-11-11T00:00:00Z');
  expect(staleSnapshotAge('2026-11-11T00:00:00', fetched + 60_000)).toBeNull();
  expect(staleSnapshotAge('2026-11-11T00:00:00', fetched + 60_001)).toBe(60_001);
  expect(staleSnapshotAge(null, fetched + 600_000)).toBeNull();
});
