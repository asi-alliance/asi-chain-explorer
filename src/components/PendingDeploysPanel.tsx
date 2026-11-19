import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { GET_PENDING_DEPLOYS, WATCH_PENDING_DEPLOYS } from '../graphql/queries';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useLivePendingDeploysStatus } from '../hooks/usePendingDeploysStatus';
import type { PendingDeploy } from '../types';
import { heightLabel } from '../utils/blockHeight';
import { deployTime, pendingDeployStatus, truncatedTotal } from '../utils/pendingDeploys';
import { PendingSourceNotes } from './PendingDeployDetails';

export const PENDING_LIST_LIMIT = 20;

const shortKey = (value: string) => (value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value);

const PendingDeploysPanel: React.FC = () => {
  const status = useLivePendingDeploysStatus();
  const configured = status.status !== null;
  const list = useLiveQuery<{ pending_deploys: PendingDeploy[] }>(WATCH_PENDING_DEPLOYS, GET_PENDING_DEPLOYS, {
    variables: { limit: PENDING_LIST_LIMIT },
    skip: !configured,
  });

  const deploys = list.data?.pending_deploys ?? [];
  const count = status.status?.count;
  const total = status.status ? truncatedTotal(status.status) : null;
  const error = status.error ?? list.error;
  const loading = (status.loading && !status.status) || (configured && list.loading && !list.data);

  let body: React.ReactNode;
  if (error) {
    body = <p className="text-muted" role="status">Pending deploys are not available: {error.message}</p>;
  } else if (loading) {
    body = <p className="text-muted" role="status">Loading pending deploys...</p>;
  } else if (!status.status) {
    body = (
      <p className="text-muted" role="status">
        This indexer does not track pending deploys. An indexer reads them from the validators listed in
        its PENDING_DEPLOYS_NODES setting.
      </p>
    );
  } else {
    const live = status.live && list.live;
    body = (
      <>
        <p className="text-muted" style={{ fontSize: '14px' }}>
          Deploys in the deploy buffers of {status.status.nodes === 1 ? '1 validator' : `${status.status.nodes} validators`} that
          are not in a block yet. A deploy usually stays here only until its validator proposes the next block.
          {status.status.intervalMs !== null && ` The indexer checks every ${status.status.intervalMs} ms.`}
          {' '}{live ? 'Updates live.' : 'Live updates are not available; the list refreshes every 5 seconds.'}
          {count !== undefined && count > deploys.length && ` Showing the latest ${deploys.length} of ${count}.`}
        </p>
        <PendingSourceNotes status={status.status} />
        {total !== null && (
          <p className="text-warning" role="note" style={{ fontSize: '14px' }}>
            The indexer tracks {count} distinct deploys. Each validator returns at most 1000 entries.
            Including entries beyond those limits, the reported total is {total}.
          </p>
        )}
        {deploys.length === 0 ? (
          <p className="text-muted">{status.status.reachable === status.status.nodes ?
              'No deploys are waiting for a block.' : 'No pending deploys are visible in the available snapshots.'}</p>
        ) : (
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
                  const state = pendingDeployStatus(deploy);
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
                        <span className={state.className}>{state.label}</span>
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
        )}
      </>
    );
  }

  return (
    <section className="asi-card mb-3" aria-labelledby="pending-deploys-heading">
      <div className="section-header">
        <h2 id="pending-deploys-heading" style={{ margin: 0 }}>Pending Deploys</h2>
        {count !== undefined && !error && (
          <span className="text-warning" aria-label="Pending deploy count">{count}</span>
        )}
      </div>
      {body}
    </section>
  );
};

export default PendingDeploysPanel;
