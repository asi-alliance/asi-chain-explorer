import { formatRaw } from './amounts';

export interface NativeTransferOutcome {
  call_id: string;
  call_index: number;
  initiation_block_hash: string;
  initiation_block_number: string | number;
  initiation_deploy_id: string;
  from_address?: string | null;
  to_address?: string | null;
  requested_amount: string;
  token_decimals: number;
  status: string;
  result_id?: string | null;
  completion_block_hash?: string | null;
  completion_block_number?: string | number | null;
  completion_deploy_id?: string | null;
  transfer_id?: string | number | null;
}

const STATUS_VIEWS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-warning' },
  completed: { label: 'Completed', className: 'text-success' },
  rejected: { label: 'Rejected', className: 'text-error' },
  // The result belongs to another call that the node merged with this one.
  coalesced: { label: 'Coalesced', className: 'text-muted' },
};

export function lifecycleStatusView(status: unknown): { label: string; className: string } {
  if (typeof status === 'string' && Object.prototype.hasOwnProperty.call(STATUS_VIEWS, status)) {
    return STATUS_VIEWS[status];
  }
  return { label: typeof status === 'string' && status !== '' ? status : 'Unknown', className: 'text-muted' };
}

// Requested amounts are signed integer text in raw units; rejected calls can be negative.
export function formatSignedRaw(value: unknown, decimals: unknown): string | null {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)$/.test(value) || value === '-0') return null;
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 77) return null;
  const negative = value.startsWith('-');
  const formatted = formatRaw(negative ? value.slice(1) : value, decimals);
  return negative ? `-${formatted}` : formatted;
}

export function splitByRole(rows: NativeTransferOutcome[], deployId: string) {
  return {
    initiated: rows.filter((row) => row.initiation_deploy_id === deployId),
    completedHere: rows.filter(
      (row) => row.completion_deploy_id === deployId && row.initiation_deploy_id !== deployId
    ),
  };
}
