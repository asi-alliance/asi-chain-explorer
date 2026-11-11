import React from 'react';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { GET_NATIVE_TRANSFER_LIFECYCLE } from '../graphql/nativeTransfers';
import { CURRENT_TOKEN } from '../utils/constants';
import { heightLabel } from '../utils/blockHeight';
import { getBlockPath } from '../utils/blockPath';
import {
  NativeTransferOutcome,
  formatSignedRaw,
  lifecycleStatusView,
  splitByRole,
} from '../utils/nativeTransfers';

interface NativeTransferLifecycleProps {
  deployId: string;
}

const shortKey = (value?: string | null) =>
  !value ? '--' : value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;

const Amount: React.FC<{ row: NativeTransferOutcome }> = ({ row }) => {
  const formatted = formatSignedRaw(row.requested_amount, row.token_decimals);
  return formatted === null
    ? <span className="mono" title="Unparsed requested amount">{row.requested_amount}</span>
    : <span>{formatted} {CURRENT_TOKEN}</span>;
};

const DeployRef: React.FC<{ deployId?: string | null; blockHash?: string | null; blockNumber?: string | number | null }> = ({
  deployId,
  blockHash,
  blockNumber,
}) => {
  if (!deployId) return <span className="text-muted">--</span>;
  return (
    <span>
      <Link to={`/transaction/${deployId}`} className="mono" title={deployId}>{shortKey(deployId)}</Link>
      {blockHash && (
        <>
          {' in block '}
          <Link to={getBlockPath(blockHash, blockNumber)}>{heightLabel(blockNumber)}</Link>
        </>
      )}
    </span>
  );
};

// Hidden when the indexer does not expose the view: the rest of the page must keep working.
const NativeTransferLifecycle: React.FC<NativeTransferLifecycleProps> = ({ deployId }) => {
  const { data, error } = useQuery(GET_NATIVE_TRANSFER_LIFECYCLE, {
    variables: { deployId },
    skip: !deployId,
  });

  if (error || !data) return null;
  const rows: NativeTransferOutcome[] = data.native_transfer_lifecycle ?? [];
  const { initiated, completedHere } = splitByRole(rows, deployId);
  if (initiated.length === 0 && completedHere.length === 0) return null;

  return (
    <section className="asi-card mt-3" aria-labelledby="native-transfer-calls-heading">
      <h3 id="native-transfer-calls-heading" style={{ marginBottom: '0.5rem' }}>Native Transfer Calls</h3>
      <p className="text-muted" style={{ fontSize: '14px' }}>
        Native transfer calls and their observed outcomes. A transfer can complete in a later deploy.
        Only completed calls produce ledger transfers, and a fork can record more than one outcome for a call.
      </p>

      {initiated.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table aria-label="Calls started by this deploy">
            <thead>
              <tr>
                <th className="text-1">Call</th>
                <th className="text-1">From</th>
                <th className="text-1">To</th>
                <th className="text-1">Requested Amount</th>
                <th className="text-1">Status</th>
                <th className="text-1">Completion</th>
              </tr>
            </thead>
            <tbody>
              {initiated.map((row) => {
                const status = lifecycleStatusView(row.status);
                return (
                  <tr key={`${row.call_id}:${row.result_id ?? ''}`}>
                    <td className="text-3">{row.call_index}</td>
                    <td className="text-3 mono" title={row.from_address ?? ''}>{shortKey(row.from_address)}</td>
                    <td className="text-3 mono" title={row.to_address ?? ''}>{shortKey(row.to_address)}</td>
                    <td className="text-3"><Amount row={row} /></td>
                    <td className="text-3"><span className={status.className}>{status.label}</span></td>
                    <td className="text-3">
                      <DeployRef
                        deployId={row.completion_deploy_id}
                        blockHash={row.completion_block_hash}
                        blockNumber={row.completion_block_number}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {completedHere.length > 0 && (
        <div style={{ overflowX: 'auto' }} className="mt-3">
          <table aria-label="Calls completed by this deploy">
            <thead>
              <tr>
                <th className="text-1">From</th>
                <th className="text-1">To</th>
                <th className="text-1">Requested Amount</th>
                <th className="text-1">Status</th>
                <th className="text-1">Started In</th>
              </tr>
            </thead>
            <tbody>
              {completedHere.map((row) => {
                const status = lifecycleStatusView(row.status);
                return (
                  <tr key={`${row.call_id}:${row.result_id ?? ''}`}>
                    <td className="text-3 mono" title={row.from_address ?? ''}>{shortKey(row.from_address)}</td>
                    <td className="text-3 mono" title={row.to_address ?? ''}>{shortKey(row.to_address)}</td>
                    <td className="text-3"><Amount row={row} /></td>
                    <td className="text-3"><span className={status.className}>{status.label}</span></td>
                    <td className="text-3">
                      <DeployRef
                        deployId={row.initiation_deploy_id}
                        blockHash={row.initiation_block_hash}
                        blockNumber={row.initiation_block_number}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default NativeTransferLifecycle;
