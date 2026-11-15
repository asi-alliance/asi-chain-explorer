import {
  deployTime, parsePendingDeploysStatus, pendingDeployStatus, snapshotTime, staleSnapshotAge, truncatedTotal,
} from './pendingDeploys';

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

test('reports a truncated pending list only when the node total exceeds the merged count', () => {
  expect(truncatedTotal({ count: 1000, totalAvailable: 1500 })).toBe(1500);
  expect(truncatedTotal({ count: 1000, totalAvailable: 1000 })).toBeNull();
});

const statusRow = (value: unknown, updated_at = '2026-11-15T00:00:00.5') => ({
  key: 'pending_deploys_status', value: typeof value === 'string' ? value : JSON.stringify(value), updated_at,
});

test('reads the indexer pending-deploy status row', () => {
  expect(parsePendingDeploysStatus([
    { key: 'pending_deploys_total_available', value: '4', updated_at: '2026-11-15T00:00:00' },
    statusRow({ nodes: 3, reachable: 2, count: 4, total_available: 4, interval_ms: 1000 }),
  ])).toEqual({
    nodes: 3, reachable: 2, count: 4, totalAvailable: 4, updatedAt: new Date('2026-11-15T00:00:00.500Z'),
  });
});

test('treats a missing or unreadable status row as pending deploys not tracked', () => {
  const valid = { nodes: 1, reachable: 1, count: 0, total_available: 0 };
  for (const rows of [
    undefined, null, [], [{ key: 'pending_deploys_total_available', value: '0' }],
    [statusRow('not json')], [statusRow('null')], [statusRow({ ...valid, nodes: 0 })],
    [statusRow({ ...valid, count: -1 })], [statusRow({ ...valid, reachable: '1' })],
    [statusRow({ ...valid, total_available: 1.5 })], [{ key: 'pending_deploys_status', value: null }],
  ]) {
    expect(parsePendingDeploysStatus(rows)).toBeNull();
  }
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
  const updated = new Date('2026-11-11T00:00:00Z');
  expect(staleSnapshotAge(updated, updated.getTime() + 30_000)).toBeNull();
  expect(staleSnapshotAge(updated, updated.getTime() + 30_001)).toBe(30_001);
  expect(staleSnapshotAge(null, updated.getTime() + 600_000)).toBeNull();
});
