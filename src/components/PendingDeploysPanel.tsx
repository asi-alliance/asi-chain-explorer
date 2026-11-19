import React from 'react';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { GET_PENDING_DEPLOYS } from '../graphql/queries';
import type { PendingDeploy } from '../types';
import { heightLabel } from '../utils/blockHeight';
import { deployTime, pendingDeployStatus, truncatedTotal } from '../utils/pendingDeploys';
import { StaleSnapshotNote } from './PendingDeployDetails';

export const PENDING_LIST_LIMIT = 20;
// The indexer refreshes its pending-deploy snapshot every sync cycle (5 s by default).
const POLL_INTERVAL_MS = 5000;

const shortKey = (value: string) => (value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value);

const PendingDeploysPanel: React.FC = () => {
  const { data, loading, error } = useQuery(GET_PENDING_DEPLOYS, {
    variables: { limit: PENDING_LIST_LIMIT },
    pollInterval: POLL_INTERVAL_MS,
  });

  const deploys: PendingDeploy[] = data?.pending_deploys ?? [];
  const stored = data?.pending_deploys_aggregate?.aggregate?.count;
  const total = truncatedTotal(stored, data?.indexer_state?.[0]?.value);

  return (
    <section className="asi-card mb-3" aria-labelledby="pending-deploys-heading">
      <div className="section-header">
        <h2 id="pending-deploys-heading" style={{ margin: 0 }}>Pending Deploys</h2>
        {stored !== undefined && !error && (
          <span className="text-warning" aria-label="Pending deploy count">{stored}</span>
        )}
      </div>

      {error ? (
        <p className="text-muted" role="status">Pending deploys are not available: {error.message}</p>
      ) : loading && !data ? (
        <p className="text-muted" role="status">Loading pending deploys...</p>
      ) : deploys.length === 0 ? (
        <p className="text-muted">No deploys are waiting for a block.</p>
      ) : (
        <>
          <p className="text-muted" style={{ fontSize: '14px' }}>
            Deploys in the node deploy buffers that are not in a block yet.
            {stored > deploys.length && ` Showing the latest ${deploys.length} of ${stored}.`}
          </p>
          <StaleSnapshotNote fetchedAt={deploys[0]?.fetched_at} />
          {total !== null && (
            <p className="text-warning" role="note" style={{ fontSize: '14px' }}>
              The node reports {total} pending deploys, but its response is limited to {stored}.
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table aria-labelledby="pending-deploys-heading">
              <thead>
                <tr>
                  <th className="text-1">Deploy</th>
                  <th className="text-1">Deployer</th>
                  <th className="text-1">Submitted</th>
                  <th className="text-1">Phlo Limit</th>
                  <th className="text-1">Phlo Price</th>
                  <th className="text-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {deploys.map((deploy) => {
                  const status = pendingDeployStatus(deploy);
                  const submitted = deployTime(deploy.timestamp);
                  return (
                    <tr key={deploy.sig}>
                      <td className="hash-cell">
                        <Link to={`/transaction/${deploy.sig}`} className="mono" title={deploy.sig}>
                          {shortKey(deploy.sig)}
                        </Link>
                      </td>
                      <td className="text-3 mono" title={deploy.deployer_address}>
                        {shortKey(deploy.deployer_address)}
                      </td>
                      <td className="text-3">
                        {submitted ? formatDistanceToNow(submitted, { addSuffix: true }) : '--'}
                      </td>
                      <td className="text-3">{deploy.phlo_limit ?? '--'}</td>
                      <td className="text-3">{deploy.phlo_price ?? '--'}</td>
                      <td className="text-3">
                        <span className={status.className}>{status.label}</span>
                        {deploy.included_deployment && (
                          <> in block {heightLabel(deploy.included_deployment.block_number)}</>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

export default PendingDeploysPanel;
