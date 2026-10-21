import { normalizedRaw, formatRaw, percentage } from "../utils/amounts";
import React from 'react';
import { useQuery } from '@apollo/client';
import { GET_ACTIVE_VALIDATORS } from '../graphql/queries';
import { Validator } from '../types';
import { CURRENT_TOKEN } from '../utils/constants';

const ValidatorsPage: React.FC = () => {
  const { data, loading, error } = useQuery(GET_ACTIVE_VALIDATORS, {
    pollInterval: 5000, // Poll every 5 seconds
  });

  const rawValidators = data?.validators || [];
  const validatorBonds = data?.validator_bonds || [];
  const allBlocks = data?.blocks || [];
  
  // Function to normalize validator keys for comparison
  // We need to extract just the first 8 and last 8 chars for comparison
  const normalizeValidatorKey = (key: string): string => {
    if (!key) return '';
    
    // If it's an abbreviated key (contains ellipsis like "04837a4c...b2df065f")
    if (key.includes('...')) {
      const parts = key.split('...');
      if (parts.length === 2) {
        // Extract first 8 and last 8 chars from abbreviated format
        return `${parts[0]}${parts[1]}`;
      }
    }
    
    // If it's a full key (64+ chars), extract first 8 and last 8
    if (key.length >= 64) {
      return `${key.slice(0, 8)}${key.slice(-8)}`;
    }
    
    // Return as-is if neither format matches
    return key;
  };
  
  // Deduplicate validators by normalized key prefix
  const validatorMap = new Map<string, any>();
  rawValidators.forEach((validator: any) => {
    const normalizedKey = normalizeValidatorKey(validator.public_key);
    const existing = validatorMap.get(normalizedKey);
    
    if (!existing) {
      validatorMap.set(normalizedKey, validator);
    } else {
      // Prefer the entry with more complete data
      // Keep the one with the full key if available
      if (validator.public_key.length > existing.public_key.length) {
        validatorMap.set(normalizedKey, validator);
      } else if (validator.public_key.length === existing.public_key.length) {
        // If both have same key length, keep the one with higher stake or more recent activity
        if ((validator.last_seen_block || 0) > (existing.last_seen_block || 0)) {
          validatorMap.set(normalizedKey, validator);
        }
      }
    }
  });
  
  const validators = Array.from(validatorMap.values());
  
  if (!loading) {
    if (error) {
      console.error('ValidatorsPage error:', error);
    }
  }
  
  // Create a map of validator public key to their latest bond
  // Map both full and normalized keys to handle duplicates
  const bondsByValidator: { [key: string]: any } = {};
  const bondsByNormalizedKey: { [key: string]: any } = {};
  
  validatorBonds.forEach((bond: any) => {
    const normalizedKey = normalizeValidatorKey(bond.validator_public_key);
    
    // Store by original key
    const existingBond = bondsByValidator[bond.validator_public_key];
    if (!existingBond || bond.block_number > existingBond.block_number) {
      bondsByValidator[bond.validator_public_key] = bond;
    }
    
    // Also store by normalized key for lookup
    const existingNormalizedBond = bondsByNormalizedKey[normalizedKey];
    if (!existingNormalizedBond || bond.block_number > existingNormalizedBond.block_number) {
      bondsByNormalizedKey[normalizedKey] = bond;
    }
  });
  
  // Count blocks proposed by each validator
  const blockProposedCounts: { [key: string]: number } = {};
  allBlocks.forEach((block: { proposer: string }) => {
    if (block.proposer) {
      blockProposedCounts[block.proposer] = (blockProposedCounts[block.proposer] || 0) + 1;
    }
  });
  
  // Calculate total stake using the latest bond stake for each validator
  const totalStake = validators.reduce((sum: bigint, validator: Validator) => {
    // Try to find bond by both original key and normalized key
    const normalizedKey = normalizeValidatorKey(validator.public_key);
    const latestBond = bondsByValidator[validator.public_key] || bondsByNormalizedKey[normalizedKey];
    let stake = 0n;
    
    if (latestBond?.stake !== undefined && latestBond?.stake !== null) {
      // Handle both string and number types
      stake = normalizedRaw(latestBond.stake, latestBond.token_decimals);
    } else if (validator.total_stake !== undefined && validator.total_stake !== null) {
      // Handle both string and number types
      stake = normalizedRaw(validator.total_stake, validator.token_decimals);
    }
    
    // console.log(`Validator ${validator.public_key.substring(0,10)}... stake:`, stake, 'type:', typeof stake, 'source:', latestBond ? 'bond' : 'total_stake');
    return sum + stake;
  }, 0n);

  // Sort validators by their stake (bond or total_stake)
  const sortedValidators = [...validators].sort((a, b) => {
    const aNormalizedKey = normalizeValidatorKey(a.public_key);
    const bNormalizedKey = normalizeValidatorKey(b.public_key);
    const aLatestBond = bondsByValidator[a.public_key] || bondsByNormalizedKey[aNormalizedKey];
    const bLatestBond = bondsByValidator[b.public_key] || bondsByNormalizedKey[bNormalizedKey];
    
    let aStake = 0n;
    if (aLatestBond?.stake !== undefined && aLatestBond?.stake !== null) {
      aStake = normalizedRaw(aLatestBond.stake, aLatestBond.token_decimals);
    } else if (a.total_stake !== undefined && a.total_stake !== null) {
      aStake = normalizedRaw(a.total_stake, a.token_decimals);
    }
    
    let bStake = 0n;
    if (bLatestBond?.stake !== undefined && bLatestBond?.stake !== null) {
      bStake = normalizedRaw(bLatestBond.stake, bLatestBond.token_decimals);
    } else if (b.total_stake !== undefined && b.total_stake !== null) {
      bStake = normalizedRaw(b.total_stake, b.token_decimals);
    }
    
    return bStake > aStake ? 1 : bStake < aStake ? -1 : 0;
  });

  const truncateKey = (key: string) => {
    if (!key || key.length < 32) return key;
    return `${key.slice(0, 16)}...${key.slice(-16)}`;
  };

  return (
    <section className="asi-card">
      <div className="section-header">
        <h1>Active Validators</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="status-indicator" style={{ background: 'var(--asi-lime)' }}></span>
            <h3 className="text-muted">Live Updates</h3>
          </div>
          <h3>
            <a 
              href="/validator-history" 
              className="btn btn-secondary"
              style={{ padding: '0.5rem 1rem' }}
            >
              View History →
            </a>
          </h3>
        </div>
      </div>

      {loading ? (
        <div className="text-center">
          <span className="loading"></span>
          <p className="text-muted mt-2">Loading validators...</p>
        </div>
      ) : error ? (
        <div className="status-message error">
          <strong>Error:</strong> {error.message}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="summary-grid mb-3">
            <div className="asi-card glass">
              <h5 className="text-muted" style={{ marginBottom: '0.5rem' }}>Total Validators</h5>
              <h1 style={{ margin: 0 }}>{validators.length}</h1>
            </div>
            <div className="asi-card glass">
              <h5 className="text-muted" style={{ marginBottom: '0.5rem' }}>Total {CURRENT_TOKEN} Staked</h5>
              <h1 style={{ margin: 0 }}>
                {formatRaw(totalStake, 77)} {CURRENT_TOKEN}
              </h1>
            </div>
            <div className="asi-card glass">
              <h5 className="text-muted" style={{ marginBottom: '0.5rem' }}>Avg. Stake</h5>
              <h1 style={{ margin: 0 }}>
                {validators.length > 0 ? 
                  formatRaw(totalStake / BigInt(validators.length), 77) :
                  '0.00'
                } {CURRENT_TOKEN}
              </h1>
            </div>
          </div>

          {/* Validators Table */}
          {validators.length === 0 ? (
            <div className="text-center" style={{ padding: '3rem' }}>
              <p className="text-muted">No validator data available</p>
              <p className="text-muted" style={{ fontSize: '14px', marginTop: '0.5rem' }}>
                The validators table may be empty or still syncing
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                  <thead>
                    <tr>
                      <th className="text-1">Public Key</th>
                      <th className="text-1">Stake ({CURRENT_TOKEN})</th>
                      <th className="text-1">Stake %</th>
                      <th className="text-1">Blocks Proposed</th>
                      <th className="text-1">First Seen</th>
                      <th className="text-1">Last Seen</th>
                      <th className="text-1">Last Active</th>
                      <th className="text-1">Status</th>
                    </tr>
                  </thead>
                <tbody>
                  {sortedValidators.map((validator: Validator) => {
                    const normalizedKey = normalizeValidatorKey(validator.public_key);
                    const latestBond = bondsByValidator[validator.public_key] || bondsByNormalizedKey[normalizedKey];
                    const blocksProposed = blockProposedCounts[validator.public_key] || 0;
                    
                    // Use the same logic as total calculation
                    let stake = 0n;
                    if (latestBond?.stake !== undefined && latestBond?.stake !== null) {
                      stake = normalizedRaw(latestBond.stake, latestBond.token_decimals);
                    } else if (validator.total_stake !== undefined && validator.total_stake !== null) {
                      stake = normalizedRaw(validator.total_stake, validator.token_decimals);
                    }
                    
                    const stakePercentage = percentage(stake, totalStake);
                    
                    return (
                      <tr key={validator.public_key} className="fade-in">
                        <td className="hash-cell">
                          <span className="text-3 mono" title={validator.public_key}>
                            {truncateKey(validator.public_key)}
                          </span>
                        </td>
                        <td className="text-3" style={{ fontWeight: 600 }}>
                          {formatRaw(stake, 77)}
                        </td>
                        <td className="text-3">
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            {stakePercentage}%
                          </span>
                        </td>
                        <td className="text-3 text-center">
                          {blocksProposed.toLocaleString()}
                        </td>
                        <td className="text-3">
                          {validator.first_seen_block ? `#${validator.first_seen_block}` : '--'}
                        </td>
                        <td className="text-3">
                          {validator.last_seen_block ? `#${validator.last_seen_block}` : '--'}
                        </td>
                        <td className="text-3">
                          {latestBond ? (
                            <span>#{latestBond.block_number.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted">Never bonded</span>
                          )}
                        </td>
                        <td className="text-3">
                          <span className={validator.status === 'active' ? "text-success" : "text-muted"}>
                            {validator.status || (latestBond ? 'Bonded' : 'Unbonded')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default ValidatorsPage;