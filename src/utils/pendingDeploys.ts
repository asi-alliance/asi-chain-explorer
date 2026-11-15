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

// The indexer stores timestamps in UTC without a time zone.
export function snapshotTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value === '') return null;
  const text = value.replace(' ', 'T');
  const time = text.split('T')[1] ?? '';
  const zoned = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(time);
  const date = new Date(zoned ? text : `${text}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export const PENDING_STATUS_KEY = 'pending_deploys_status';

/** The indexer's pending-deploy reader, from its `pending_deploys_status` row. */
export interface PendingDeploysStatus {
  /** Validators listed in the indexer's PENDING_DEPLOYS_NODES. */
  nodes: number;
  /** Validators whose buffer the last read reached. */
  reachable: number;
  /** Deploys in the merged snapshot. */
  count: number;
  /** Deploys before each node's response cap. */
  totalAvailable: number;
  /** Last write of the status row; the indexer rewrites it at least every 10 s. */
  updatedAt: Date | null;
}

interface StateRow {
  key?: unknown;
  value?: unknown;
  updated_at?: unknown;
}

const counter = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Parses the indexer status row. Null means that the indexer does not read
 * pending deploys (without PENDING_DEPLOYS_NODES it deletes the row) or that
 * the row is unreadable: either way the explorer must not present a queue.
 */
export function parsePendingDeploysStatus(rows: unknown): PendingDeploysStatus | null {
  if (!Array.isArray(rows)) return null;
  const row = (rows as StateRow[]).find((item) => item?.key === PENDING_STATUS_KEY);
  if (!row || typeof row.value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const fields = parsed as Record<string, unknown>;
  const nodes = counter(fields.nodes);
  const reachable = counter(fields.reachable);
  const count = counter(fields.count);
  const totalAvailable = counter(fields.total_available);
  if (!nodes || reachable === null || count === null || totalAvailable === null) return null;
  return { nodes, reachable, count, totalAvailable, updatedAt: snapshotTime(row.updated_at) };
}

// Each node caps its pending-deploy response; the indexer records the total before the caps.
export function truncatedTotal(status: Pick<PendingDeploysStatus, 'count' | 'totalAvailable'>): number | null {
  return status.totalAvailable > status.count ? status.totalAvailable : null;
}

// The indexer rewrites its status row at least every 10 s while it reads the
// validators. When it stops, the last snapshot stays in the table unchanged.
export const STALE_SNAPSHOT_MS = 30_000;

export function staleSnapshotAge(updatedAt: Date | null, now: number): number | null {
  if (!updatedAt) return null;
  const age = now - updatedAt.getTime();
  return age > STALE_SNAPSHOT_MS ? age : null;
}
