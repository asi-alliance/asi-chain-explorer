// The indexer stores successful ledger movements only, so no transfer status means failure.
const MOVEMENT_LABELS: Record<string, string> = {
  success: 'Success',
  genesis_mint: 'Genesis Allocation',
  genesis_bond: 'Genesis Bond',
};

export interface TransferStatusView {
  label: string;
  completed: boolean;
}

export function transferStatusView(status: unknown): TransferStatusView {
  if (typeof status === 'string' && Object.prototype.hasOwnProperty.call(MOVEMENT_LABELS, status)) {
    return { label: MOVEMENT_LABELS[status], completed: true };
  }
  return { label: typeof status === 'string' && status !== '' ? status : 'Unknown', completed: false };
}
