import type { PendingDeploy } from '../types';

export type PendingDeployState = 'included' | 'retrying' | 'pending';

export interface PendingDeployStatus {
  state: PendingDeployState;
  label: string;
  className: string;
}

export function pendingDeployStatus(deploy: Pick<PendingDeploy, 'is_rejected' | 'included_deployment'>): PendingDeployStatus {
  if (deploy.included_deployment) {
    return { state: 'included', label: 'Included', className: 'text-success' };
  }
  if (deploy.is_rejected) {
    // The node keeps a deploy in its rejected-recovery buffer after a merge conflict.
    return { state: 'retrying', label: 'Retrying after rejection', className: 'text-warning' };
  }
  return { state: 'pending', label: 'Pending', className: 'text-warning' };
}

// Deploy timestamps are milliseconds; Hasura returns bigint values as strings.
export function deployTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (!/^(0|[1-9]\d*)$/.test(text)) return null;
  const ms = Number(text);
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date : null;
}

// The node caps its pending-deploy response; the indexer records the count before the cap.
export function truncatedTotal(stored: unknown, totalAvailable: unknown): number | null {
  const storedCount = Number(stored);
  const total = Number(totalAvailable);
  if (!Number.isSafeInteger(storedCount) || !Number.isSafeInteger(total)) return null;
  return total > storedCount ? total : null;
}

// The indexer stores fetched_at as a UTC timestamp without a time zone.
export function snapshotTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const text = value.replace(' ', 'T');
  const time = text.split('T')[1] ?? '';
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(time);
  const date = new Date(zoned ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

// The indexer refreshes the snapshot every sync cycle (5 s by default). When it
// cannot read the node buffers, it keeps the last snapshot without a change.
export const STALE_SNAPSHOT_MS = 60_000;

export function staleSnapshotAge(fetchedAt: unknown, now: number): number | null {
  const date = snapshotTime(fetchedAt);
  if (!date) return null;
  const age = now - date.getTime();
  return age > STALE_SNAPSHOT_MS ? age : null;
}
