import React from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { ChevronRight } from 'lucide-react';
import { GET_BLOCK_DETAILS, GET_BLOCKS_AT_HEIGHT, GET_LATEST_HEIGHT } from '../graphql/queries';
import { Block } from '../types';
import { formatRelativeTime } from '../utils/time';
import { CURRENT_TOKEN } from '../utils/constants';
import { getParentHashes } from '../utils/blockParent';
import { heightInput } from '../utils/blockHeight';
import { formatRaw } from '../utils/amounts';
import { getBlockPath } from '../utils/blockPath';
import CopyButton from '../components/CopyButton';
import ShareLinkButton from '../components/ShareLinkButton';
import '../styles/height.css';

const BlockDetailPage: React.FC = () => {
  const { blockHash, blockNumber, height } = useParams<{
    blockHash?: string;
    blockNumber?: string;
    height?: string;
  }>();
  const routeHeight = height ?? blockNumber;

  const hashResult = useQuery(GET_BLOCK_DETAILS, {
    variables: { blockHash: blockHash || '' },
    skip: !blockHash,
  });
  const heightResult = useQuery(GET_BLOCKS_AT_HEIGHT, {
    variables: { blockNumber: routeHeight || '0' },
    skip: !routeHeight,
  });
  const latestHeightResult = useQuery<{ blocks: Array<{ block_number: string }> }>(GET_LATEST_HEIGHT);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') === 'finalized'
    ? 'finalized'
    : searchParams.get('status') === 'unfinalized' ? 'unfinalized' : 'all';
  const setStatusFilter = (value: 'all' | 'finalized' | 'unfinalized') => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next);
  };

  const activeResult = blockHash ? hashResult : heightResult;
  const { data, loading, error } = activeResult;

  if (loading) {
    return (
      <div className="text-center">
        <span className="loading"></span>
        <p className="text-muted mt-2">Loading block details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-message error">
        <strong>Error:</strong> {error.message}
      </div>
    );
  }

  const matchingBlocks = (data?.blocks || []) as Block[];
  const block = matchingBlocks[0];
  const requestedBlock = blockHash || routeHeight;

  if (!block) {
    return (
      <div className="status-message error">
        <strong>Block Not Found:</strong> Block {requestedBlock} was not found on the network.
      </div>
    );
  }

  const formatTimestamp = (timestamp: string | number) => formatRelativeTime(timestamp);

  const formatDate = (timestamp: string | number) => {
    try {
      const ts = parseInt(timestamp.toString());
      const date = new Date(ts);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid date';
    }
  };

  const truncateAddress = (address: string) => {
    if (!address || address.length < 32) return address;
    return `${address.slice(0, 20)}...${address.slice(-20)}`;
  };

  const getTransactionType = (deploy: any) => {
    if (deploy.deployment_type) {
      return deploy.deployment_type;
    }
    
    if (deploy.term) {
      if (deploy.term.includes('ASIVault') && deploy.term.includes('transfer')) {
        return 'ASI Transfer';
      } else if (deploy.term.includes('validator') || deploy.term.includes('bond')) {
        return 'Validator Operation';
      } else if (deploy.term.includes('ch_')) {
        return 'Channel Operation';
      }
    }
    
    return 'Contract Deployment';
  };

  // Try to extract transfer details from Rholang term
  const extractTransferDetails = (term: string) => {
    const cleanTerm = term.replace(/\\n/g, ' ');
    const matchPattern = /match\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)n?\s*\)/;
    const match = cleanTerm.match(matchPattern);
    
    if (match) {
      return {
        from: match[1],
        to: match[2],
        amount: formatRaw(match[3], block.token_decimals)
      };
    }
    return null;
  };

  const finalizationLabel = (status?: string | null) =>
    status ? status.replace(/_/g, ' ') : 'Unknown';
  const finalizationClass = (status?: string | null) =>
    status === 'finalized' ? 'is-finalized' : status ? 'is-pending' : 'is-unknown';
  const siblingCount = matchingBlocks.length;
  const siblingCountLabel = siblingCount >= 100 ? '100+' : String(siblingCount);
  const isHeightView = Boolean(routeHeight) && !blockHash;
  const showHeightOverview = isHeightView && siblingCount > 1;
  const currentHeight = heightInput(routeHeight || String(block.block_number));
  const latestHeight = heightInput(latestHeightResult.data?.blocks?.[0]?.block_number || '');
  const previousHeight = currentHeight !== null && BigInt(currentHeight) > 0n
    ? (BigInt(currentHeight) - 1n).toString() : null;
  const nextHeight = currentHeight !== null && latestHeight !== null && BigInt(currentHeight) < BigInt(latestHeight)
    ? (BigInt(currentHeight) + 1n).toString() : null;
  const filteredSiblings = matchingBlocks.filter((sibling) => {
    if (statusFilter === 'finalized') return sibling.finalization_status === 'finalized';
    if (statusFilter === 'unfinalized') return sibling.finalization_status !== 'finalized';
    return true;
  });

  const heightNav = (
    <div className="height-nav">
      {previousHeight === null ? (
        <span className="height-nav__disabled">← Previous height</span>
      ) : (
        <Link className="btn btn-secondary" to={`/height/${previousHeight}`}>← Height #{previousHeight}</Link>
      )}
      {latestHeight !== null && (
        <Link className="height-nav__latest" to={`/height/${latestHeight}`}>Latest #{latestHeight}</Link>
      )}
      {nextHeight === null ? (
        <span className="height-nav__disabled">Next height →</span>
      ) : (
        <Link className="btn btn-secondary" to={`/height/${nextHeight}`}>Height #{nextHeight} →</Link>
      )}
    </div>
  );

  if (showHeightOverview) {
    const timestamps = matchingBlocks
      .map((sibling) => Number(sibling.timestamp))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
    const earliestTimestamp = timestamps.length ? Math.min(...timestamps) : null;
    const latestTimestamp = timestamps.length ? Math.max(...timestamps) : null;
    const formatClock = (timestamp: number) =>
      new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const earliestText = earliestTimestamp === null ? null : formatClock(earliestTimestamp);
    const latestText = latestTimestamp === null ? null : formatClock(latestTimestamp);
    const timeRange = earliestText === null || latestText === null
      ? 'N/A'
      : earliestText === latestText ? earliestText : `${earliestText} – ${latestText}`;
    const timeRangeTitle = earliestTimestamp === null || latestTimestamp === null
      ? undefined
      : earliestTimestamp === latestTimestamp
        ? formatDate(latestTimestamp)
        : `${formatDate(earliestTimestamp)} – ${formatDate(latestTimestamp)}`;
    const finalizedCount = matchingBlocks
      .filter((sibling) => sibling.finalization_status === 'finalized').length;

    return (
      <>
        <nav className="page-actions">
          <Link to="/" className="btn btn-secondary">← Back to home</Link>
          <ShareLinkButton label="Copy height link" />
        </nav>
        {heightNav}

        <section className="asi-card height-overview">
          <header className="height-overview__head">
            <div>
              <p className="height-overview__eyebrow">Block height</p>
              <h1 className="height-overview__title">#{routeHeight}</h1>
            </div>
            <div className="height-overview__actions">
              <CopyButton dataToCopy={String(routeHeight)} label="Copy height" iconSize={14} />
              <span className="height-overview__count">
                {siblingCountLabel} sibling blocks
              </span>
            </div>
          </header>

          <p className="height-overview__hint">
            A block height is not unique in the DAG. Select a block hash to open its details.
          </p>

          <div className="height-overview__stats">
            <div className="asi-card glass">
              <p className="text-muted">Height</p>
              <strong>#{routeHeight}</strong>
            </div>
            <div className="asi-card glass">
              <p className="text-muted">Sibling blocks</p>
              <strong>{siblingCountLabel}</strong>
            </div>
            <div className="asi-card glass">
              <p className="text-muted">Finalized</p>
              <strong>{finalizedCount} of {matchingBlocks.length}</strong>
            </div>
            <div className="asi-card glass">
              <p className="text-muted">Time range</p>
              <strong title={timeRangeTitle}>{timeRange}</strong>
            </div>
          </div>

          {matchingBlocks.length === 100 && (
            <p className="height-overview__limit">
              Showing the first 100 blocks at this height.
            </p>
          )}

          <div className="height-overview__legend">
            <span><i className="is-finalized" /> Finalized</span>
            <span><i className="is-pending" /> Unfinalized</span>
            <span><i className="is-unknown" /> Unknown</span>
            <div className="height-overview__filters" role="group" aria-label="Filter sibling blocks">
              {([
                ['all', 'All'],
                ['finalized', 'Finalized'],
                ['unfinalized', 'Unfinalized'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'is-active' : ''}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredSiblings.length === 0 ? (
            <p className="height-overview__empty">No {statusFilter} blocks at this height.</p>
          ) : (
            <ol className="height-overview__list">
              {filteredSiblings.map((sibling) => (
                <li key={sibling.block_hash}>
                  <Link
                    className="height-sibling"
                    to={getBlockPath(sibling.block_hash, sibling.block_number)}
                    aria-label={`Open block ${sibling.block_hash}`}
                  >
                    <span className="height-sibling__hash mono" title={sibling.block_hash}>
                      {sibling.block_hash}
                    </span>
                    <span className="height-sibling__meta">
                      Proposer <span className="mono">{truncateAddress(sibling.proposer)}</span>
                    </span>
                    <span className="height-sibling__links">
                      {sibling.parent_links?.length || 0} parents · {sibling.child_links?.length || 0} children
                    </span>
                    <span className="height-sibling__time" title={formatDate(sibling.timestamp)}>
                      {formatTimestamp(sibling.timestamp)}
                    </span>
                    <span className="height-sibling__deploys">
                      {sibling.deployment_count || 0} deploys
                    </span>
                    <span className={`height-sibling__status ${finalizationClass(sibling.finalization_status)}`}>
                      {finalizationLabel(sibling.finalization_status)}
                    </span>
                    <ChevronRight size={18} aria-hidden="true" className="height-sibling__chevron" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      {/* Navigation */}
      <nav className="page-actions">
        <Link to="/" className="btn btn-secondary">← Back to home</Link>
        <ShareLinkButton label="Copy block link" />
      </nav>
      {heightNav}

      {/* Block Summary Cards */}
      <div className="summary-grid mb-3">
        <div className="asi-card glass">
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Height</p>
          <h3 className="text-success" style={{ margin: 0 }}>
            <Link to={getBlockPath(null, block.block_number)}>
              {block.block_number.toLocaleString()}
            </Link>
          </h3>
        </div>
        <div className="asi-card glass">
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Proposer</p>
          <h3 style={{ margin: 0 }}>
            {truncateAddress(block.proposer)}
          </h3>
        </div>
        <div className="asi-card glass">
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Time</p>
          <h3 style={{ margin: 0 }}>
            {formatTimestamp(block.timestamp)}
          </h3>
        </div>
        <div className="asi-card glass">
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Status</p>
          <h3
            className={block.finalization_status === 'finalized' || !block.finalization_status ? 'text-success' : 'text-warning'}
            style={{ margin: 0 }}
          >
            {block.finalization_status ? `✓ ${finalizationLabel(block.finalization_status)}` : '✓ Confirmed'}
          </h3>
        </div>
      </div>

      {blockHash && (
        <p className="text-muted" style={{ margin: '-0.5rem 0 1.5rem' }}>
          <Link to={getBlockPath(null, block.block_number)}>View all blocks at height #{block.block_number}</Link>
        </p>
      )}

      {/* Block Details */}
      <section className="asi-card">
        <h2 style={{ marginBottom: '1.5rem' }}>Block Details</h2>
        <dl style={{ 
          display: 'grid', 
          gridTemplateColumns: 'max-content 1fr', 
          gap: 'var(--spacing-sm) var(--spacing-lg)',
          margin: 0 
        }}>
          <dt>Height</dt>
          <dd className="block-number detail-copy-row">
            <Link to={getBlockPath(null, block.block_number)}>{block.block_number.toLocaleString()}</Link>
            <CopyButton dataToCopy={String(block.block_number)} label="Copy height" iconSize={13} />
          </dd>
          
          <dt>Block Hash</dt>
          <dd className="mono detail-copy-row">
            <span className="detail-hash">{block.block_hash}</span>
            <CopyButton dataToCopy={block.block_hash} label="Copy block hash" iconSize={13} />
          </dd>
          
          <dt>Parent Hash{getParentHashes(block).length > 1 ? 'es' : ''}</dt>
          <dd className="mono">
            {getParentHashes(block).length > 0
              ? getParentHashes(block).map((ph, i) => (
                  <React.Fragment key={ph}>
                    {i > 0 && <span style={{ display: 'block', height: '0.25rem' }} />}
                    <Link to={getBlockPath(ph)}>{ph}</Link>
                  </React.Fragment>
                ))
              : 'N/A (genesis)'}
          </dd>

          <dt>Child Hash{(block.child_links?.length || 0) > 1 ? 'es' : ''}</dt>
          <dd className="mono">
            {(block.child_links?.length || 0) > 0
              ? block.child_links?.map((child, index) => (
                  <React.Fragment key={child.block_hash}>
                    {index > 0 && <span style={{ display: 'block', height: '0.25rem' }} />}
                    <Link to={getBlockPath(child.block_hash)}>{child.block_hash}</Link>
                  </React.Fragment>
                ))
              : 'None indexed'}
          </dd>
          
          <dt>State Hash</dt>
          <dd className="mono">{block.state_hash || 'N/A'}</dd>
          
          <dt>State Root Hash</dt>
          <dd className="mono">{block.state_root_hash || 'N/A'}</dd>
          
          <dt>Pre-State Hash</dt>
          <dd className="mono">{block.pre_state_hash || 'N/A'}</dd>
          
          <dt>Proposer</dt>
          <dd>
            <span className="mono" style={{ fontSize: '11px' }}>{block.proposer}</span>
          </dd>
          
          <dt>Timestamp</dt>
          <dd>
            {formatDate(block.timestamp)} 
            <span className="text-muted"> ({formatTimestamp(block.timestamp)})</span>
          </dd>
          
          <dt>Finalization Status</dt>
          <dd>
            <span className={block.finalization_status === 'finalized' || !block.finalization_status ? 'text-success' : 'text-warning'}>
              {finalizationLabel(block.finalization_status || 'finalized')}
            </span>
          </dd>
          
          <dt>Version</dt>
          <dd>{block.version || 'N/A'}</dd>
          
          <dt>Sequence Number</dt>
          <dd>{block.seq_num || 'N/A'}</dd>
          
          <dt>Shard ID</dt>
          <dd className="mono">{block.shard_id || 'N/A'}</dd>
          
          <dt>Fault Tolerance</dt>
          <dd>{block.fault_tolerance !== undefined ? block.fault_tolerance : 'N/A'}</dd>
          
          <dt>Deployment Count</dt>
          <dd>{block.deployment_count || 0}</dd>
        </dl>
      </section>

      {/* Advanced Block Information */}
      {(block.sig || block.extra_bytes) && (
        <section className="asi-card mt-3">
          <h2>Advanced Information</h2>
          <dl style={{ 
            display: 'grid', 
            gridTemplateColumns: 'max-content 1fr', 
            gap: 'var(--spacing-sm) var(--spacing-lg)',
            margin: 0 
          }}>
            {block.sig && (
              <>
                <dt>Block Signature</dt>
                <dd>
                  <details>
                    <summary style={{ cursor: 'pointer', color: 'var(--asi-pulse-blue)' }}>
                      View Signature
                    </summary>
                    <pre style={{ 
                      marginTop: '0.5rem',
                      padding: '1rem',
                      background: 'var(--deep-space)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      wordBreak: 'break-all'
                    }}>
                      {block.sig}
                    </pre>
                  </details>
                </dd>
                
                <dt>Signature Algorithm</dt>
                <dd>{block.sig_algorithm || 'secp256k1'}</dd>
              </>
            )}
            
            {block.extra_bytes && (
              <>
                <dt>Extra Data</dt>
                <dd>
                  <details>
                    <summary style={{ cursor: 'pointer', color: 'var(--asi-pulse-blue)' }}>
                      View Extra Bytes
                    </summary>
                    <pre style={{ 
                      marginTop: '0.5rem',
                      padding: '1rem',
                      background: 'var(--deep-space)',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}>
                      {block.extra_bytes}
                    </pre>
                  </details>
                </dd>
              </>
            )}
          </dl>
        </section>
      )}

      {/* Bonds Map */}
      {block.bonds_map && block.bonds_map.length > 0 && (
        <section className="asi-card mt-3">
          <h2>Validator Bonds Map</h2>
          <p className="text-muted mb-2">
            Current bond stakes for {block.bonds_map.length} validators
          </p>
          <table>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Stake</th>
              </tr>
            </thead>
            <tbody>
              {block.bonds_map.map((bond: any, index: number) => (
                <tr key={index}>
                  <td className="mono" style={{ fontSize: '11px' }}>
                    {bond.validator}
                  </td>
                  <td>{formatRaw(bond.stake, block.token_decimals)} {CURRENT_TOKEN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Justifications */}
      {block.justifications && block.justifications.length > 0 && (
        <section className="asi-card mt-3">
          <h2>Block Justifications</h2>
          <p className="text-muted mb-2">
            {block.justifications.length} justifications from validators
          </p>
          <table>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Latest Block Hash</th>
              </tr>
            </thead>
            <tbody>
              {block.justifications.map((just: any, index: number) => (
                <tr key={index}>
                  <td className="mono" style={{ fontSize: '11px' }}>
                    {just.validator ? `${just.validator.slice(0, 20)}...${just.validator.slice(-20)}` : 'N/A'}
                  </td>
                  <td className="mono" style={{ fontSize: '11px' }}>
                    {just.latestBlockHash ? `${just.latestBlockHash.slice(0, 20)}...${just.latestBlockHash.slice(-20)}` : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}


      {/* Deployments */}
      {block.deployments && block.deployments.length > 0 && (
        <section className="asi-card mt-3">
          <h2>Transactions / Deployments</h2>
          <p className="text-muted mb-2">
            {block.deployments.length} deployments in this block
          </p>
          
          <div>
            {block.deployments.map((deploy: any, index: number) => {
              const transactionType = getTransactionType(deploy);
              const isTransfer = transactionType === 'ASI Transfer';
              const transferDetails = isTransfer && deploy.term ? extractTransferDetails(deploy.term) : null;
              
              return (
                <div key={deploy.deploy_id} className="deployment-item" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ 
                    padding: '1rem', 
                    background: 'var(--charcoal-500)', 
                    borderRadius: '8px', 
                    border: isTransfer ? '1px solid var(--asi-lime)' : '1px solid var(--border-color)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'start', 
                      marginBottom: '0.75rem' 
                    }}>
                      <h4 style={{ margin: 0, color: 'var(--asi-lime)', fontSize: '1.1rem' }}>
                        {transactionType}
                      </h4>
                      <span className={deploy.errored ? 'text-error' : 'text-success'} 
                            style={{ fontSize: '14px' }}>
                        {deploy.errored ? '✗ Failed' : '✓ Success'}
                      </span>
                    </div>
                    
                    <dl style={{ 
                      margin: 0, 
                      display: 'grid', 
                      gridTemplateColumns: '120px 1fr', 
                      gap: '0.5rem', 
                      alignItems: 'start' 
                    }}>
                      {transferDetails && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            From
                          </dt>
                          <dd className="mono" style={{ fontSize: '12px', margin: 0, wordBreak: 'break-all' }}>
                            {transferDetails.from}
                          </dd>
                          
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            To
                          </dt>
                          <dd className="mono" style={{ fontSize: '12px', margin: 0, wordBreak: 'break-all' }}>
                            {transferDetails.to}
                          </dd>
                          
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Amount
                          </dt>
                          <dd style={{ 
                            fontSize: '14px', 
                            margin: 0, 
                            color: 'var(--asi-lime)', 
                            fontWeight: 600 
                          }}>
                            {transferDetails.amount} {CURRENT_TOKEN}
                          </dd>
                        </>
                      )}
                      
                      <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                        Deploy ID
                      </dt>
                      <dd className="mono" style={{ fontSize: '12px', margin: 0, wordBreak: 'break-all' }}>
                        {deploy.deploy_id}
                      </dd>
                      
                      <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                        Deployer
                      </dt>
                      <dd className="mono" style={{ fontSize: '12px', margin: 0, wordBreak: 'break-all' }}>
                        {deploy.deployer}
                      </dd>
                      
                      <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                        Phlo Cost
                      </dt>
                      <dd style={{ fontSize: '13px', margin: 0 }}>
                        {deploy.phlo_cost?.toLocaleString() || '0'}
                        {deploy.phlo_limit && deploy.phlo_price && (
                          <span className="text-muted" style={{ fontSize: '12px' }}>
                            {' '}(limit: {deploy.phlo_limit.toLocaleString()}, price: {deploy.phlo_price})
                          </span>
                        )}
                      </dd>
                      
                      {deploy.valid_after_block_number !== undefined && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Valid After Block
                          </dt>
                          <dd style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.valid_after_block_number}
                          </dd>
                        </>
                      )}
                      
                      {deploy.status && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Status
                          </dt>
                          <dd style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.status}
                          </dd>
                        </>
                      )}
                      
                      {deploy.seq_num !== undefined && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Sequence
                          </dt>
                          <dd style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.seq_num}
                          </dd>
                        </>
                      )}
                      
                      {deploy.shard_id && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Shard ID
                          </dt>
                          <dd style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.shard_id}
                          </dd>
                        </>
                      )}
                      
                      {deploy.errored && deploy.error_message && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Error
                          </dt>
                          <dd className="text-error" style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.error_message}
                          </dd>
                        </>
                      )}

                      {/* Show transfers from the transfers table if available */}
                      {deploy.transfers && deploy.transfers.length > 0 && (
                        <>
                          <dt style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>
                            Transfers
                          </dt>
                          <dd style={{ fontSize: '13px', margin: 0 }}>
                            {deploy.transfers.length} {CURRENT_TOKEN} transfer{deploy.transfers.length > 1 ? 's' : ''}
                          </dd>
                        </>
                      )}
                    </dl>
                    
                    {/* Deployment Signature */}
                    {deploy.sig && (
                      <details style={{ marginTop: '0.75rem' }}>
                        <summary style={{ 
                          cursor: 'pointer', 
                          color: 'var(--asi-pulse-blue)', 
                          fontSize: '14px', 
                          padding: '0.5rem 0' 
                        }}>
                          View Deployment Signature
                        </summary>
                        <div style={{ 
                          margin: '0.5rem 0 0 0', 
                          padding: '1rem', 
                          background: 'var(--deep-space)', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          border: '1px solid var(--border-color)' 
                        }}>
                          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem' }}>
                            <dt style={{ color: 'var(--text-tertiary)' }}>Signature:</dt>
                            <dd className="mono" style={{ margin: 0, wordBreak: 'break-all' }}>{deploy.sig}</dd>
                            
                            <dt style={{ color: 'var(--text-tertiary)' }}>Algorithm:</dt>
                            <dd style={{ margin: 0 }}>{deploy.sig_algorithm || 'secp256k1'}</dd>
                          </dl>
                        </div>
                      </details>
                    )}
                    
                    {deploy.term && (
                      <details style={{ marginTop: '0.75rem' }}>
                        <summary style={{ 
                          cursor: 'pointer', 
                          color: 'var(--asi-pulse-blue)', 
                          fontSize: '14px', 
                          padding: '0.5rem 0' 
                        }}>
                          View Rholang Code
                        </summary>
                        <pre style={{ 
                          margin: '0.5rem 0 0 0', 
                          padding: '1rem', 
                          background: 'var(--deep-space)', 
                          borderRadius: '6px', 
                          fontSize: '13px', 
                          lineHeight: '1.6', 
                          border: '1px solid var(--border-color)', 
                          maxHeight: '500px', 
                          overflow: 'auto' 
                        }}>
                          <code style={{ 
                            color: 'var(--asi-lime)', 
                            fontFamily: "'Fira Mono', 'SF Mono', Monaco, monospace", 
                            display: 'block',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {deploy.term
                              .replace(/\\"/g, '"')
                              .replace(/\\\\/g, '\\')
                              .replace(/\\n/g, '\n')
                              .replace(/\\t/g, '  ')}
                          </code>
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
};

export default BlockDetailPage;
