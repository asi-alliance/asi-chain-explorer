import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useIndexerStatus } from '../hooks/useIndexerStatus';

const IndexerStatusPage: React.FC = () => {
  const { data, loading, error } = useIndexerStatus();
  const label = loading ? 'Loading' : data?.label ?? 'Unavailable';
  const color = label === 'Synced' ? 'var(--asi-lime)'
    : label === 'Syncing' ? 'var(--asi-pulse-blue)' : 'var(--warning)';
  const height = (value: number | null | undefined) => value == null ? 'Unknown' : value.toLocaleString();
  // Do not round a nearly caught-up indexer to a misleading 100.00%.
  const percentage = data?.percentage == null ? null : Math.floor(data.percentage * 100) / 100;
  const indexed = height(data?.lastIndexedBlock);
  const latest = height(data?.latestBlock);
  return (
    <section className="asi-card">
      <div className="section-header">
        <h1>Indexer Status</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="status-indicator" style={{ background: color }} />
          <h3 className="text-muted">{label}</h3>
        </div>
      </div>
      {loading && <p role="status">Loading indexer status...</p>}
      {error && <p role="alert">Indexer status is unavailable. Retrying automatically.</p>}
      {data?.label === 'Unavailable' && <p role="alert">The indexer cannot reach the node.</p>}
      {data?.lag != null && data.lag < 0 && <p role="alert">The indexer is ahead of the node. Check that both are using the same network and current chain state.</p>}
      <div className="summary-grid mb-3">
        <div className="asi-card glass">
          <h5 className="text-muted">Sync Progress</h5>
          <h2 style={{ margin: 0, color }}>{percentage === null ? 'Unknown' : `${percentage.toFixed(2)}%`}</h2>
          {percentage !== null && (
            <div role="progressbar" aria-label="Sync progress" aria-valuenow={percentage}
              aria-valuemin={0} aria-valuemax={100}
              style={{ marginTop: '0.5rem', height: '4px', background: 'var(--charcoal-400)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: color }} />
            </div>
          )}
        </div>
        <div className="asi-card glass">
          <h5 className="text-muted">Last Indexed Block</h5>
          <h2 style={{ margin: 0 }}>{indexed}</h2>
          <p className="text-3 text-muted" style={{ margin: '0.5rem 0 0 0' }}>
            {data?.lag == null ? 'Lag unknown' : `${Math.abs(data.lag).toLocaleString()} ${Math.abs(data.lag) === 1 ? 'block' : 'blocks'} ${data.lag < 0 ? 'ahead of node' : 'behind'}`}
          </p>
        </div>
        <div className="asi-card glass">
          <h5 className="text-muted">Node Finalized Block</h5>
          <h2 style={{ margin: 0 }}>{latest}</h2>
        </div>
        <div className="asi-card glass">
          <h5 className="text-muted">Last Update</h5>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
            {data?.lastUpdate ? formatDistanceToNow(data.lastUpdate, { addSuffix: true }) : 'Unknown'}
          </h2>
        </div>
      </div>
      <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Indexer Status</h3>
      <table>
        <thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Last Indexed Block</td><td className="mono">{indexed}</td></tr>
          <tr><td>Node Finalized Block</td><td className="mono">{latest}</td></tr>
          <tr><td>Sync Status</td><td style={{ color }}>{label}</td></tr>
        </tbody>
      </table>
    </section>
  );
};

export default IndexerStatusPage;
