import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import type { PendingDeploy } from '../types';
import { heightLabel } from '../utils/blockHeight';
import { getBlockPath } from '../utils/blockPath';
import { deployTime, pendingDeployStatus } from '../utils/pendingDeploys';

interface PendingDeployDetailsProps {
  deploy: PendingDeploy;
}

const timeText = (value: unknown) => {
  const date = deployTime(value);
  return date ? format(date, 'yyyy-MM-dd HH:mm:ss') : '--';
};

const PendingDeployDetails: React.FC<PendingDeployDetailsProps> = ({ deploy }) => {
  const status = pendingDeployStatus(deploy);
  const fields: Array<[string, React.ReactNode]> = [
    ['Deploy signature', <span className="mono" style={{ wordBreak: 'break-all' }}>{deploy.sig}</span>],
    ['Deployer address', <span className="mono" style={{ wordBreak: 'break-all' }}>{deploy.deployer_address}</span>],
    ['Submitted', timeText(deploy.timestamp)],
    ['Valid after block', heightLabel(deploy.valid_after_block_number)],
    ['Expires', deploy.expiration_timestamp && String(deploy.expiration_timestamp) !== '0'
      ? timeText(deploy.expiration_timestamp) : '--'],
    ['Phlo limit', deploy.phlo_limit ?? '--'],
    ['Phlo price', deploy.phlo_price ?? '--'],
    ['Shard', deploy.shard_id || '--'],
  ];

  return (
    <section className="asi-card" aria-labelledby="pending-deploy-heading">
      <div className="section-header">
        <h2 id="pending-deploy-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={24} className="text-warning" aria-hidden="true" />
          Deploy Pending
        </h2>
        <span className={status.className}>{status.label}</span>
      </div>
      <p className="text-muted" role="status">
        {status.state === 'included' && deploy.included_deployment ? (
          <>
            The node included this deploy in block{' '}
            <Link to={getBlockPath(deploy.included_deployment.block_hash, deploy.included_deployment.block_number)}>
              {heightLabel(deploy.included_deployment.block_number)}
            </Link>
            . This page shows the indexed deploy when it is available.
          </>
        ) : status.state === 'retrying' ? (
          'The node rejected this deploy after a merge conflict and keeps it for another attempt. It is not in a block yet. This page updates when the deploy is indexed.'
        ) : (
          'This deploy is in the node deploy buffer and is not in a block yet. This page updates when the deploy is indexed.'
        )}
      </p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.5rem 1.5rem' }}>
        {fields.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd style={{ margin: 0 }}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {deploy.term && (
        <>
          <h3>Code</h3>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '320px', overflow: 'auto' }}>
            {deploy.term}
          </pre>
        </>
      )}
    </section>
  );
};

export default PendingDeployDetails;
