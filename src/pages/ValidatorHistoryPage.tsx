import { normalizedRaw, formatRaw, percentage, groupThousands } from "../utils/amounts";
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { formatLocalTime, formatRelativeTime } from '../utils/time';
import { CURRENT_TOKEN } from '../utils/constants';
import { blockHeight, heightInput } from '../utils/blockHeight';
import { ValidatorBond } from '../types';
import '../styles/validators.css';

const GET_VALIDATOR_HISTORY = gql`
  query GetValidatorHistory($blockNumber: bigint) {
    blocks(where: { block_number: { _eq: $blockNumber } }, order_by: {block_hash: asc}) {
      block_number
      timestamp
      block_hash
      proposer
      validator_bonds(order_by: [{stake: desc}, {validator_public_key: asc}]) {
        id block_hash block_number stake token_decimals validator_public_key
      }
    }
  }
`;

const GET_BLOCK_RANGE = gql`
  query GetBlockRange {
    blocks(order_by: { block_number: desc }, limit: 1) {
      block_hash
      block_number
    }
  }
`;

interface HistoryBlock {
  block_hash: string;
  block_number: string | number;
  timestamp: string | number;
  proposer: string;
  validator_bonds: ValidatorBond[];
}

const ValidatorHistoryPage: React.FC = () => {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState('');
  
  const { data: rangeData, loading: rangeLoading, error: rangeError } = useQuery<{
    blocks: Array<{ block_hash: string; block_number: string | number }>;
  }>(GET_BLOCK_RANGE);
  // Heights stay exact decimal strings: Hasura returns bigint heights as strings.
  // A failed, empty or invalid latest-block response is never read as height 0.
  const latestRow = rangeData?.blocks?.[0];
  const maxBlock = blockHeight(latestRow?.block_number)?.toString() ?? null;
  const minBlock = '0';
  const rangeProblem = rangeError
    ? `Could not load the latest block: ${rangeError.message}`
    : rangeLoading || maxBlock !== null
      ? null
      : latestRow
        ? 'The latest block has an invalid height.'
        : 'No blocks are indexed yet.';

  const currentBlock = selectedBlock ?? maxBlock;
  const { data, loading, error } = useQuery<{ blocks: HistoryBlock[] }>(GET_VALIDATOR_HISTORY, {
    variables: { blockNumber: currentBlock },
    skip: currentBlock === null,
  });

  const handleBlockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = heightInput(e.target.value);
    if (value !== null && maxBlock !== null && BigInt(value) <= BigInt(maxBlock)) {
      setSelectedBlock(value);
      setSelectedHash('');
    }
  };

  const truncateKey = (key: string) => {
    if (!key || key.length < 32) return key;
    return `${key.slice(0, 16)}...${key.slice(-16)}`;
  };

  const formatTimestamp = (timestamp: string | number) => formatRelativeTime(timestamp);

  const calculateStake = (stake: unknown, decimals?: number): string => formatRaw(stake, decimals);

  // Intl formats a bigint exactly, so separators do not cost precision.
  const grouped = (height: string) => BigInt(height).toLocaleString('en-US');
  const returnedHeight = (value: unknown) => {
    const height = blockHeight(value);
    return height === null ? 'Invalid height' : `#${height.toLocaleString('en-US')}`;
  };

  const blocks = data?.blocks || [];
  const blockInfo = blocks.find(block => block.block_hash === selectedHash) || blocks[0];
  const validators = blockInfo?.validator_bonds || [];
  const blockInfoHeight = blockInfo ? blockHeight(blockInfo.block_number) : null;

  // Calculate total stake for percentage
  const totalStake = validators.reduce((sum, v) => {
    // Handle both string and number types
    const stake = normalizedRaw(v.stake, v.token_decimals);
    return sum + (stake || 0n);
  }, 0n);

  return (
    <section className="asi-card">
      <div className="section-header">
        <h1>Validator History</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="block-input" className="text-muted" style={{ fontSize: '14px' }}>
              Block:
            </label>
            <input
              id="block-input"
              type="number"
              min={minBlock}
              max={maxBlock ?? undefined}
              value={currentBlock ?? ''}
              disabled={maxBlock === null}
              onChange={handleBlockChange}
              style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--charcoal-500)',
                color: 'var(--text-primary)',
                width: '120px'
              }}
            />
            <span className="text-muted" style={{ fontSize: '12px' }}>
              ({grouped(minBlock)} - {maxBlock === null ? '--' : grouped(maxBlock)})
            </span>
          </div>
        </div>
      </div>

      {blocks.length > 0 && <label style={{ display: 'block', marginBottom: '1rem' }}>
        Block hash ({blocks.length} at this height)
        <select aria-label="Validator history block hash" value={blockInfo?.block_hash || ''}
          onChange={event => setSelectedHash(event.target.value)} style={{ maxWidth: '100%' }}>
          {blocks.map(block => <option key={block.block_hash} value={block.block_hash}>{block.block_hash}</option>)}
        </select>
      </label>}

      {rangeProblem ? (
        <div className="status-message error">
          <strong>Error:</strong> {rangeProblem}
        </div>
      ) : loading || currentBlock === null ? (
        <div className="text-center">
          <span className="loading"></span>
          <p className="text-muted mt-2">Loading validator history...</p>
        </div>
      ) : error ? (
        <div className="status-message error">
          <strong>Error:</strong> {error.message}
        </div>
      ) : (
        <>
          {/* Block Information */}
          {blockInfo && (
            <div className="summary-grid mb-3">
              <section className="asi-card glass" aria-labelledby="history-height-heading">
                <h2 id="history-height-heading" className="summary-card__label">Height</h2>
                <p className="summary-card__value">
                  {blockInfoHeight !== null ? (
                    <Link className="height-link" to={`/height/${blockInfoHeight.toString()}`}>
                      {returnedHeight(blockInfo.block_number)}
                    </Link>
                  ) : (
                    returnedHeight(blockInfo.block_number)
                  )}
                </p>
              </section>
              <section className="asi-card glass" aria-labelledby="history-time-heading">
                <h2 id="history-time-heading" className="summary-card__label">Block Time</h2>
                <p
                  className="summary-card__value summary-card__value--small"
                  title={formatLocalTime(blockInfo.timestamp)}
                >
                  {formatTimestamp(blockInfo.timestamp)}
                </p>
              </section>
              <section className="asi-card glass" aria-labelledby="history-proposer-heading">
                <h2 id="history-proposer-heading" className="summary-card__label">Proposer</h2>
                <p className="summary-card__value summary-card__value--small mono">
                  <Link className="height-link" to="/validators" title={blockInfo.proposer}>
                    {truncateKey(blockInfo.proposer)}
                  </Link>
                </p>
              </section>
              <section className="asi-card glass" aria-labelledby="history-validators-heading">
                <h2 id="history-validators-heading" className="summary-card__label">Active Validators</h2>
                <p className="summary-card__value">{validators.length}</p>
              </section>
            </div>
          )}

          {/* Validators Table */}
          {validators.length === 0 ? (
            <div className="text-center" style={{ padding: '3rem' }}>
              <p className="text-muted">No validator data available for block #{grouped(currentBlock)}</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr className="text-1">
                    <th>#</th>
                    <th>Validator Public Key</th>
                    <th>Stake ({CURRENT_TOKEN})</th>
                    <th>Stake %</th>
                    <th>Proposer</th>
                  </tr>
                </thead>
                <tbody>
                  {validators.map((bond, index) => {
                    const publicKey = bond.validator_public_key ?? '';
                    const stakePercentage = percentage(normalizedRaw(bond.stake, bond.token_decimals), totalStake);
                    const isProposer = publicKey === blockInfo?.proposer;
                    
                    return (
                      <tr key={publicKey || index} className="fade-in">
                        <td className="text-center">{index + 1}</td>
                        <td className="hash-cell">
                          <span className="text-3 mono" title={publicKey}>
                            {truncateKey(publicKey)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {groupThousands(calculateStake(bond.stake, bond.token_decimals))} {CURRENT_TOKEN}
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            {stakePercentage}%
                          </span>
                        </td>
                        <td className="text-center">
                          {isProposer && (
                            <span className="text-success" title="Block Proposer">
                              ✓ Proposer
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Summary */}
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1rem', 
                background: 'var(--charcoal-500)', 
                borderRadius: '8px' 
              }}>
                <dl style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '1rem', 
                  margin: 0 
                }}>
                  <div>
                    <dt className="text-muted" style={{ fontSize: '14px', marginBottom: '0.25rem' }}>
                      Total Stake
                    </dt>
                    <dd style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                      {groupThousands(formatRaw(totalStake, 77))} {CURRENT_TOKEN}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted" style={{ fontSize: '14px', marginBottom: '0.25rem' }}>
                      Average Stake
                    </dt>
                    <dd style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                      {validators.length > 0 
                        ? groupThousands(formatRaw(totalStake / BigInt(validators.length), 77))
                        : '0.00'
                      } {CURRENT_TOKEN}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted" style={{ fontSize: '14px', marginBottom: '0.25rem' }}>
                      Min Stake
                    </dt>
                    <dd style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                      {validators.length > 0 
                        ? groupThousands(formatRaw(validators.map(v => normalizedRaw(v.stake, v.token_decimals)).reduce((a, b) => a < b ? a : b), 77))
                        : '0.00'
                      } {CURRENT_TOKEN}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted" style={{ fontSize: '14px', marginBottom: '0.25rem' }}>
                      Max Stake
                    </dt>
                    <dd style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                      {validators.length > 0 
                        ? groupThousands(formatRaw(validators.map(v => normalizedRaw(v.stake, v.token_decimals)).reduce((a, b) => a > b ? a : b), 77))
                        : '0.00'
                      } {CURRENT_TOKEN}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default ValidatorHistoryPage;