import { normalizedRaw, formatRaw, percentage, groupThousands } from "../utils/amounts";
import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { GET_ACTIVE_VALIDATORS, GET_RECENT_PROPOSERS } from "../graphql/queries";
import { Block, NetworkStats, Validator, ValidatorBond } from "../types";
import { CURRENT_TOKEN } from "../utils/constants";
import { blockHeight, heightLabel, isNewerHeight } from "../utils/blockHeight";
import CopyButton from "../components/CopyButton";
import "../styles/validators.css";

const PROPOSAL_WINDOW = 1000;

const normalizeValidatorKey = (key: string): string => {
  if (!key) return "";

  // If it's an abbreviated key (contains ellipsis like "04837a4c...b2df065f")
  if (key.includes("...")) {
    const parts = key.split("...");
    if (parts.length === 2) {
      return `${parts[0]}${parts[1]}`;
    }
  }

  // If it's a full key (64+ chars), extract first 8 and last 8
  if (key.length >= 64) {
    return `${key.slice(0, 8)}${key.slice(-8)}`;
  }

  return key;
};

const truncateKey = (key: string) => {
  if (!key || key.length < 32) return key;
  return `${key.slice(0, 16)}...${key.slice(-16)}`;
};

const statusText = (status?: string) => {
  if (!status) return "Unknown";
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
};

const statusKind = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value === "active" || value === "bonded") return "active";
  if (value === "inactive") return "inactive";
  return "other";
};

const statusTitle = (status?: string) => {
  const kind = statusKind(status);
  if (kind === "active") return "In the current bond set";
  if (kind === "inactive") return "Not in the current bond set";
  return "Recorded validator status";
};

const displayStake = (value: bigint): string => groupThousands(formatRaw(value, 77));

const HeightLink: React.FC<{ value: unknown }> = ({ value }) => {
  const height = blockHeight(value);
  const label = heightLabel(value);
  if (height === null) {
    return <span>{label}</span>;
  }
  return (
    <Link to={`/height/${height.toString()}`} className="height-link">
      {label}
    </Link>
  );
};

const ValidatorsSkeleton: React.FC = () => (
  <div role="status" aria-label="Loading validators">
    <div className="summary-grid mb-3">
      {[0, 1, 2].map((index) => (
        <div className="asi-card glass" key={index}>
          <span className="skeleton skeleton--short" aria-hidden="true" />
          <span className="skeleton skeleton--stat" aria-hidden="true" />
        </div>
      ))}
    </div>
    <div className="skeleton" style={{ height: 240 }} aria-hidden="true" />
  </div>
);

interface SecondaryDetailsProps {
  proposed: React.ReactNode;
  first: unknown;
  last: unknown;
  bond?: unknown;
  showBond?: boolean;
}

const SecondaryDetails: React.FC<SecondaryDetailsProps> = ({
  proposed,
  first,
  last,
  bond,
  showBond = true,
}) => (
  <details className="validator-mobile-details">
    <summary>Details</summary>
    <dl>
      <dt>Proposed (last {PROPOSAL_WINDOW.toLocaleString("en-US")})</dt>
      <dd>{proposed}</dd>
      <dt>First seen</dt>
      <dd><HeightLink value={first} /></dd>
      <dt>Last seen</dt>
      <dd><HeightLink value={last} /></dd>
      {showBond && (
        <>
          <dt>Last bond</dt>
          <dd>{bond === null || bond === undefined ? "Never bonded" : <HeightLink value={bond} />}</dd>
        </>
      )}
    </dl>
  </details>
);

const ValidatorsPage: React.FC = () => {
  const {
    data,
    loading,
    error,
    refetch,
  } = useQuery<{
    validators: Validator[];
    validator_bonds: ValidatorBond[];
    network_stats: NetworkStats[];
  }>(GET_ACTIVE_VALIDATORS, {
    pollInterval: 15000,
  });

  const {
    data: proposerData,
    loading: proposersLoading,
    error: proposersError,
    refetch: refetchProposers,
  } = useQuery<{
    blocks: Pick<Block, "block_hash" | "block_number" | "proposer">[];
  }>(GET_RECENT_PROPOSERS, {
    pollInterval: 60000,
  });

  const rawValidators = data?.validators || [];
  const validatorBonds = data?.validator_bonds || [];
  const allBlocks = proposerData?.blocks || [];
  const network = data?.network_stats?.[0];
  const consensusHeight = blockHeight(network?.block_number);

  // Deduplicate validators by normalized key prefix.
  const validatorMap = new Map<string, Validator>();
  rawValidators.forEach(validator => {
    const normalizedKey = normalizeValidatorKey(validator.public_key);
    const existing = validatorMap.get(normalizedKey);

    if (!existing) {
      validatorMap.set(normalizedKey, validator);
    } else if (validator.public_key.length > existing.public_key.length) {
      validatorMap.set(normalizedKey, validator);
    } else if (validator.public_key.length === existing.public_key.length) {
      if (isNewerHeight(validator.last_seen_block, existing.last_seen_block)) {
        validatorMap.set(normalizedKey, validator);
      }
    }
  });

  const validators = Array.from(validatorMap.values());

  // Create a map of validator public key to their latest bond.
  // Heights are bigint strings from Hasura: compare them exactly, never as strings.
  const bondsByValidator: Record<string, ValidatorBond> = {};
  const bondsByNormalizedKey: Record<string, ValidatorBond> = {};

  validatorBonds.forEach(bond => {
    const publicKey = bond.validator_public_key;
    if (!publicKey) return;
    const normalizedKey = normalizeValidatorKey(publicKey);

    const existingBond = bondsByValidator[publicKey];
    if (!existingBond || isNewerHeight(bond.block_number, existingBond.block_number)) {
      bondsByValidator[publicKey] = bond;
    }

    const existingNormalizedBond = bondsByNormalizedKey[normalizedKey];
    if (!existingNormalizedBond || isNewerHeight(bond.block_number, existingNormalizedBond.block_number)) {
      bondsByNormalizedKey[normalizedKey] = bond;
    }
  });

  // Count blocks proposed by each validator in the recent window.
  const blockProposedCounts: { [key: string]: number } = {};
  allBlocks.forEach((block) => {
    if (block.proposer) {
      blockProposedCounts[block.proposer] = (blockProposedCounts[block.proposer] || 0) + 1;
    }
  });

  const latestBondOf = (validator: Validator) =>
    bondsByValidator[validator.public_key] || bondsByNormalizedKey[normalizeValidatorKey(validator.public_key)];

  // Latest bond stake when known, otherwise the stake recorded on the validator row.
  const stakeOf = (validator: Validator): bigint => {
    const latestBond = latestBondOf(validator);
    if (latestBond?.stake !== undefined && latestBond?.stake !== null) {
      return normalizedRaw(latestBond.stake, latestBond.token_decimals);
    }
    if (validator.total_stake !== undefined && validator.total_stake !== null) {
      return normalizedRaw(validator.total_stake, validator.token_decimals);
    }
    return 0n;
  };

  const byStakeDesc = (a: Validator, b: Validator) => {
    const aStake = stakeOf(a);
    const bStake = stakeOf(b);
    return bStake > aStake ? 1 : bStake < aStake ? -1 : 0;
  };

  // The indexer marks validators outside the finalized bond set 'inactive' and keeps their last stake.
  const currentValidators = validators.filter((validator) => validator.status !== "inactive");
  const inactiveValidators = validators.filter((validator) => validator.status === "inactive");

  const totalStake = currentValidators.reduce((sum, validator) => sum + stakeOf(validator), 0n);
  const sortedValidators = [...currentValidators].sort(byStakeDesc);
  const sortedInactiveValidators = [...inactiveValidators].sort(byStakeDesc);
  const proposalWindow = allBlocks.length;
  const proposerCountsAvailable = Boolean(proposerData);

  const renderProposed = (count: number) => {
    if (!proposerCountsAvailable) {
      if (proposersLoading) {
        return <span className="skeleton skeleton--short" aria-hidden="true" />;
      }
      return <span title={proposersError ? "Proposer counts are unavailable" : undefined}>—</span>;
    }
    const share = proposalWindow > 0 ? `${((count / proposalWindow) * 100).toFixed(1)}%` : null;
    return (
      <span className="validator-proposed">
        {count.toLocaleString("en-US")}
        {share && <span className="text-muted"> ({share})</span>}
      </span>
    );
  };

  const retry = () => {
    void refetch();
    void refetchProposers();
  };

  return (
    <section className="asi-card">
      <div className="section-header">
        <h1>Active Validators</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="status-indicator" style={{ background: "var(--asi-lime)" }}></span>
            <span className="text-muted">Live Updates</span>
          </div>
          <Link to="/validator-history" className="btn btn-secondary" style={{ padding: "0.5rem 1rem" }}>
            View History →
          </Link>
        </div>
      </div>

      {error && (
        <div
          className={`data-state ${data ? "data-state--warning" : "data-state--error"}`}
          role={data ? "status" : "alert"}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {data
              ? "Validator data could not be refreshed."
              : `Validator data is unavailable: ${error.message}`}
          </span>
          <button type="button" className="btn btn-secondary data-state__retry" onClick={retry}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <ValidatorsSkeleton />
      ) : !data ? (
        error ? null : (
          <div className="text-center" style={{ padding: "3rem" }}>
            <p className="text-muted">No validator data available</p>
            <p className="text-muted" style={{ fontSize: "14px", marginTop: "0.5rem" }}>
              The validators table may be empty or still syncing
            </p>
          </div>
        )
      ) : (
        <>
          {network && (
            <div
              className={`validator-consensus${network.consensus_status === "healthy" ? "" : " validator-consensus--warning"}`}
              role="status"
            >
              <strong>Consensus: {statusText(network.consensus_status)}</strong>
              <span>{network.consensus_participation ?? "—"}% participation</span>
              <span>{network.validators_in_quarantine ?? 0} in quarantine</span>
              {consensusHeight !== null && (
                <span className="text-muted">as of #{consensusHeight.toLocaleString("en-US")}</span>
              )}
            </div>
          )}

          <div className="summary-grid mb-3">
            <section className="asi-card glass" aria-labelledby="validators-total-heading">
              <h2 id="validators-total-heading" className="summary-card__label">Total Validators</h2>
              <p className="summary-card__value">{currentValidators.length}</p>
            </section>
            <section className="asi-card glass" aria-labelledby="validators-staked-heading">
              <h2 id="validators-staked-heading" className="summary-card__label">
                Total {CURRENT_TOKEN} Staked
              </h2>
              <p className="summary-card__value">
                {displayStake(totalStake)} {CURRENT_TOKEN}
              </p>
            </section>
            <section className="asi-card glass" aria-labelledby="validators-average-heading">
              <h2 id="validators-average-heading" className="summary-card__label">Avg. Stake</h2>
              <p className="summary-card__value">
                {currentValidators.length > 0
                  ? displayStake(totalStake / BigInt(currentValidators.length))
                  : "0.00"}{" "}
                {CURRENT_TOKEN}
              </p>
            </section>
          </div>

          {validators.length === 0 ? (
            <div className="text-center" style={{ padding: "3rem" }}>
              <p className="text-muted">No validator data available</p>
              <p className="text-muted" style={{ fontSize: "14px", marginTop: "0.5rem" }}>
                The validators table may be empty or still syncing
              </p>
            </div>
          ) : (
            <>
              {currentValidators.length === 0 ? (
                <p className="text-muted text-center" style={{ padding: "2rem" }}>
                  No validators are in the current bond set
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table aria-label="Current validators">
                    <thead>
                      <tr>
                        <th className="text-1">Public Key</th>
                        <th className="text-1">Stake ({CURRENT_TOKEN})</th>
                        <th className="text-1">Stake %</th>
                        <th className="text-1 validator-col--secondary">
                          Proposed (last {PROPOSAL_WINDOW.toLocaleString("en-US")})
                        </th>
                        <th className="text-1 validator-col--secondary">First Seen</th>
                        <th className="text-1 validator-col--secondary">Last Seen</th>
                        <th className="text-1 validator-col--secondary">Last Bond</th>
                        <th className="text-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedValidators.map((validator) => {
                        const latestBond = latestBondOf(validator);
                        const blocksProposed = blockProposedCounts[validator.public_key] || 0;
                        const stake = stakeOf(validator);
                        const stakePercentage = percentage(stake, totalStake);
                        const proposed = renderProposed(blocksProposed);

                        return (
                          <tr key={validator.public_key} className="fade-in">
                            <td className="hash-cell">
                              <div className="validator-key">
                                <span className="text-3 mono" title={validator.public_key}>
                                  {truncateKey(validator.public_key)}
                                </span>
                                <CopyButton
                                  dataToCopy={validator.public_key}
                                  label={`Copy validator public key ${validator.public_key}`}
                                  iconSize={12}
                                  toastMessage="Validator key copied"
                                />
                              </div>
                              <SecondaryDetails
                                proposed={proposed}
                                first={validator.first_seen_block}
                                last={validator.last_seen_block}
                                bond={latestBond ? latestBond.block_number : null}
                              />
                            </td>
                            <td className="text-3" style={{ fontWeight: 600 }}>
                              {displayStake(stake)}
                            </td>
                            <td className="text-3">
                              <div className="stake-share">
                                <span className="stake-share__track" aria-hidden="true">
                                  <span
                                    className="stake-share__fill"
                                    style={{ width: `${Math.min(100, Number(stakePercentage))}%` }}
                                  />
                                </span>
                                <span className="stake-share__value">{stakePercentage}%</span>
                              </div>
                            </td>
                            <td className="text-3 text-center validator-col--secondary">{proposed}</td>
                            <td className="text-3 validator-col--secondary">
                              <HeightLink value={validator.first_seen_block} />
                            </td>
                            <td className="text-3 validator-col--secondary">
                              <HeightLink value={validator.last_seen_block} />
                            </td>
                            <td className="text-3 validator-col--secondary">
                              {latestBond ? (
                                <HeightLink value={latestBond.block_number} />
                              ) : (
                                <span className="text-muted">Never bonded</span>
                              )}
                            </td>
                            <td className="text-3">
                              <span
                                className={`validator-status validator-status--${statusKind(validator.status)}`}
                                title={statusTitle(validator.status)}
                              >
                                {statusText(validator.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {sortedInactiveValidators.length > 0 && (
                <section className="mt-3" aria-labelledby="inactive-validators-heading">
                  <h2 id="inactive-validators-heading">Inactive Validators</h2>
                  <p className="text-muted" style={{ fontSize: "14px" }}>
                    Not in the current bond set. Their last recorded stake is not counted in the totals above.
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table aria-labelledby="inactive-validators-heading">
                      <thead>
                        <tr>
                          <th className="text-1">Public Key</th>
                          <th className="text-1">Last Recorded Stake ({CURRENT_TOKEN})</th>
                          <th className="text-1 validator-col--secondary">
                            Proposed (last {PROPOSAL_WINDOW.toLocaleString("en-US")})
                          </th>
                          <th className="text-1 validator-col--secondary">First Seen</th>
                          <th className="text-1 validator-col--secondary">Last Seen</th>
                          <th className="text-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedInactiveValidators.map((validator) => {
                          const blocksProposed = blockProposedCounts[validator.public_key] || 0;
                          const proposed = renderProposed(blocksProposed);
                          return (
                            <tr key={validator.public_key}>
                              <td className="hash-cell">
                                <div className="validator-key">
                                  <span className="text-3 mono" title={validator.public_key}>
                                    {truncateKey(validator.public_key)}
                                  </span>
                                  <CopyButton
                                    dataToCopy={validator.public_key}
                                    label={`Copy validator public key ${validator.public_key}`}
                                    iconSize={12}
                                    toastMessage="Validator key copied"
                                  />
                                </div>
                                <SecondaryDetails
                                  proposed={proposed}
                                  first={validator.first_seen_block}
                                  last={validator.last_seen_block}
                                  showBond={false}
                                />
                              </td>
                              <td className="text-3 text-muted">{displayStake(stakeOf(validator))}</td>
                              <td className="text-3 text-center validator-col--secondary">{proposed}</td>
                              <td className="text-3 validator-col--secondary">
                                <HeightLink value={validator.first_seen_block} />
                              </td>
                              <td className="text-3 validator-col--secondary">
                                <HeightLink value={validator.last_seen_block} />
                              </td>
                              <td className="text-3">
                                <span
                                  className={`validator-status validator-status--${statusKind(validator.status)}`}
                                  title={statusTitle(validator.status)}
                                >
                                  {statusText(validator.status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};

export default ValidatorsPage;
