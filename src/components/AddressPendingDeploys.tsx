import React from 'react';
import { Link } from 'react-router-dom';
import { formatLocalTime, formatRelativeTime } from '../utils/time';
import { AlertTriangle, ArrowUpRight, Clock3 } from 'lucide-react';
import { GET_ADDRESS_PENDING_DEPLOYS, WATCH_ADDRESS_PENDING_DEPLOYS } from '../graphql/queries';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { usePendingDeploysStatus } from '../hooks/usePendingDeploysStatus';
import type { PendingDeploy } from '../types';
import { heightLabel } from '../utils/blockHeight';
import { getBlockPath } from '../utils/blockPath';
import { deployTime, pendingDeployStatus } from '../utils/pendingDeploys';
import { PendingSourceNotes } from './PendingDeployDetails';

export const ADDRESS_PENDING_LIMIT = 10;

const shortSignature = (value: string) => (value.length > 26 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value);

/**
 * Lists deploys that this wallet submitted and that still wait in a validator
 * buffer. The indexer stores no recipient or amount for a pending deploy, so
 * this block is deliberately separate from the indexed transfer history.
 */
export default function AddressPendingDeploys({ address }: { address: string }) {
  const pendingStatus = usePendingDeploysStatus();
  const active = pendingStatus.status;
  const pending = useLiveQuery<{ pending_deploys: PendingDeploy[] }>(
    WATCH_ADDRESS_PENDING_DEPLOYS, GET_ADDRESS_PENDING_DEPLOYS,
    { variables: { address, limit: ADDRESS_PENDING_LIMIT }, skip: !active },
  );

  if (!active) return null;

  if (pending.error && !pending.data) {
    return (
      <section className="asi-card address-pending" aria-labelledby="address-pending-heading">
        <div className="address-pending__header">
          <div className="address-pending__title">
            <span className="address-pending__icon"><Clock3 size={18} aria-hidden="true" /></span>
            <div>
              <h2 id="address-pending-heading">Pending deploys</h2>
              <p className="address-pending__subtitle">Submitted by this address; not in a block yet.</p>
            </div>
          </div>
        </div>
        <div className="address-alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Pending deploys are unavailable.</span>
        </div>
      </section>
    );
  }

  const deploys = pending.data?.pending_deploys ?? [];
  if (!deploys.length) return null;

  return (
    <section className="asi-card address-pending" aria-labelledby="address-pending-heading">
      <div className="address-pending__header">
        <div className="address-pending__title">
          <span className="address-pending__icon"><Clock3 size={18} aria-hidden="true" /></span>
          <div>
            <div className="address-pending__heading-row">
              <h2 id="address-pending-heading">Pending deploys</h2>
              <span className="address-pending__count" aria-label="Pending deploy count">{deploys.length}</span>
            </div>
            <p className="address-pending__subtitle">
              Submitted by this address. They are not in a block, so they are not part of the finalized balance
              or the indexed transfers below.
            </p>
          </div>
        </div>
        <span className={`address-pending__live${pending.live ? '' : ' is-polling'}`}>
          <span className="address-pending__dot" aria-hidden="true" />
          {pending.live ? 'Live' : 'Refreshes every 5 s'}
        </span>
      </div>

      <PendingSourceNotes status={active} />

      <div className="address-table-wrap">
        <table className="address-table address-pending__table" aria-label="Pending deploys submitted by this address">
          <thead>
            <tr>
              <th scope="col">Deploy</th>
              <th scope="col">Submitted</th>
              <th scope="col" className="amount-cell">Phlo limit</th>
              <th scope="col" className="amount-cell">Phlo price</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>{deploys.map(deploy => {
            const state = pendingDeployStatus(deploy);
            const submitted = deployTime(deploy.timestamp);
            return (
              <tr key={deploy.sig}>
                <td className="hash-cell">
                  <Link className="address-tx-link" to={`/transaction/${encodeURIComponent(deploy.sig)}`}
                    title={deploy.sig}>
                    {shortSignature(deploy.sig)} <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </td>
                <td className="text-3" title={submitted ? formatLocalTime(submitted) : undefined}>
                  {submitted ? formatRelativeTime(submitted) : '--'}
                </td>
                <td className="amount-cell text-3">{deploy.phlo_limit ?? '--'}</td>
                <td className="amount-cell text-3">{deploy.phlo_price ?? '--'}</td>
                <td className="text-3">
                  <span className={state.className}>{state.label}</span>
                  {deploy.included_deployment && (
                    <> in block <Link to={getBlockPath(deploy.included_deployment.block_hash,
                      deploy.included_deployment.block_number)}>
                      {heightLabel(deploy.included_deployment.block_number)}
                    </Link></>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      {deploys.length === ADDRESS_PENDING_LIMIT && (
        <p className="address-pending__note">Showing the latest {ADDRESS_PENDING_LIMIT} pending deploys.</p>
      )}
    </section>
  );
}
