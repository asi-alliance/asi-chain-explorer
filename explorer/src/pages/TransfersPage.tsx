// src/pages/TransfersPage.tsx
import React, { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { GET_ALL_TRANSFERS } from '../graphql/queries';
import { Transfer, GenesisFunding } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { useGenesisFunding } from '../hooks/useGenesisFunding';
import { formatGenesisFunding } from '../utils/parseGenesisFunding';
import { CURRENT_TOKEN } from '../utils/constants';

const TransfersPage: React.FC = () => {
    const [currentPage, setCurrentPage] = useState(1);
    const transfersPerPage = 10;

    const { data: queryData, loading: transfersLoading, error: transfersError } = useQuery(GET_ALL_TRANSFERS, {
        variables: { limit: 1000, offset: 0 },
        pollInterval: 2000,
    });

    const { genesisFundings, loading: genesisFundingLoading, error: genesisFundingError } = useGenesisFunding();

    // Normalize various timestamp formats to milliseconds
    const toMillis = (input: string | number | undefined | null): number => {
        if (input == null) return NaN;

        // If input is a number
        if (typeof input === 'number' && Number.isFinite(input)) {
            // Distinguish between seconds and milliseconds by magnitude
            return input > 1e12 ? input : input * 1000;
        }

        // If input is a string
        if (typeof input === 'string') {
            const s = input.trim();

            // If string contains only digits → treat as a numeric timestamp
            if (/^\d+$/.test(s)) {
                const n = Number(s);
                return n > 1e12 ? n : n * 1000;
            }

            // If string looks like an ISO date → normalize microseconds to milliseconds
            let normalized = s.replace(/(\.\d{3})\d+/, '$1'); // e.g. "....710772" → "....710"

            // If no timezone present, assume UTC (append 'Z')
            // Heuristics: there is a 'T' and no trailing 'Z' and no ±HH:MM
            if (/[T ]\d{2}:\d{2}:\d{2}/.test(normalized) && !/[zZ]$/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized)) {
                normalized += 'Z';
            }

            const ms = Date.parse(normalized); // Date.parse returns milliseconds
            return Number.isNaN(ms) ? NaN : ms;
        }

        return NaN;
    };

    const formatTimestamp = (tsLike: string | number) => {
        const ms = toMillis(tsLike);
        if (Number.isNaN(ms)) return 'Invalid date';
        return formatDistanceToNow(new Date(ms), { addSuffix: true });
    };

    // Merge and sort ALL transfers with genesis funding
    const allTransferEventsSorted = useMemo(() => {
        const transfers = queryData?.transfers || [];
        const events: Array<Transfer | GenesisFunding> = [];

        // Add all regular transfers
        transfers.forEach((transfer: Transfer) => {
            events.push(transfer);
        });

        // Add genesis funding events only once
        genesisFundings.forEach((funding: GenesisFunding) => {
            events.push(funding);
        });

        // Sort by normalized timestamp (newest first)
        events.sort((a, b) => {
            const aTime =
                'timestamp' in a
                    ? toMillis(a.timestamp as any)
                    : a.deployment?.timestamp != null
                        ? toMillis(a.deployment.timestamp as any)
                        : toMillis((a as any).created_at);

            const bTime =
                'timestamp' in b
                    ? toMillis(b.timestamp as any)
                    : b.deployment?.timestamp != null
                        ? toMillis(b.deployment.timestamp as any)
                        : toMillis((b as any).created_at);

            return (bTime || 0) - (aTime || 0);
        });

        return events;
    }, [queryData?.transfers, genesisFundings]);

    // Apply client-side pagination to the sorted list
    const allTransferEvents = useMemo(() => {
        const startIndex = (currentPage - 1) * transfersPerPage;
        const endIndex = startIndex + transfersPerPage;
        return allTransferEventsSorted.slice(startIndex, endIndex);
    }, [allTransferEventsSorted, currentPage, transfersPerPage]);

    const transferCount = allTransferEventsSorted.length;
    const totalPages = Math.ceil(transferCount / transfersPerPage);
    const loading = transfersLoading || genesisFundingLoading;
    const error = transfersError || genesisFundingError;

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) setCurrentPage(page);
    };

    const formatRevAmount = (amount: number | string) => {
        const numAmount = parseFloat(amount.toString());
        if (isNaN(numAmount)) return '0';
        if (numAmount % 1 === 0) return numAmount.toString();
        if (numAmount >= 1) return parseFloat(numAmount.toFixed(4)).toString();
        if (numAmount >= 0.000001) return parseFloat(numAmount.toFixed(6)).toString();
        return numAmount.toExponential(3);
    };

    return (
        <section className="asi-card">
            <div className="section-header">
                <h2>{CURRENT_TOKEN} Distribution & Transfers</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="status-indicator" style={{ background: 'var(--asi-lime)' }}></span>
                        <span className="text-muted" style={{ fontSize: '14px' }}>Live Updates</span>
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                        Including Genesis Funding Events
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center">
                    <span className="loading"></span>
                    <p className="text-muted mt-2">Loading transfers...</p>
                </div>
            ) : error ? (
                <div className="status-message error">
                    <strong>Error:</strong> {error.message}
                </div>
            ) : allTransferEvents.length === 0 ? (
                <p className="text-center text-muted">No {CURRENT_TOKEN} transfers found</p>
            ) : (
                <div>
                    {allTransferEvents.map((event: Transfer | GenesisFunding) => {
                        const isGenesisFunding = 'wallet_address' in event;

                        if (isGenesisFunding) {
                            const funding = event as GenesisFunding;
                            return (
                                <div key={funding.id} className="deployment-item fade-in" style={{ marginBottom: '1.5rem' }}>
                                    <div style={{
                                        padding: '1rem',
                                        background: 'var(--charcoal-500)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--asi-pulse-blue)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'start',
                                            marginBottom: '0.75rem'
                                        }}>
                                            <h4 style={{ margin: 0, color: 'var(--asi-pulse-blue)', fontSize: '1.1rem' }}>
                                                {formatGenesisFunding(funding.amount_rev)}
                                            </h4>
                                            <Link
                                                to="/block/0"
                                                className="btn btn-secondary"
                                                style={{ padding: '4px 12px', fontSize: '13px' }}
                                            >
                                                Block #0 (Genesis)
                                            </Link>
                                        </div>

                                        <dl style={{
                                            margin: 0,
                                            display: 'grid',
                                            gridTemplateColumns: '80px 1fr',
                                            gap: '0.5rem',
                                            alignItems: 'start'
                                        }}>
                                            <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                From
                                            </dt>
                                            <dd className="mono" style={{ fontSize: '11px', margin: 0, color: 'var(--asi-pulse-blue)' }}>
                                                Genesis (System Mint)
                                            </dd>

                                            <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                To
                                            </dt>
                                            <dd className="mono" style={{ fontSize: '11px', margin: 0, wordBreak: 'break-all' }}>
                                                {funding.wallet_address}
                                            </dd>

                                            <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                Time
                                            </dt>
                                            <dd style={{ fontSize: '12px', margin: 0 }}>
                                                {formatTimestamp(funding.timestamp)}
                                            </dd>

                                            <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                Status
                                            </dt>
                                            <dd style={{ fontSize: '12px', margin: 0 }}>
                                                <span className="text-success">✓ Genesis Funding</span>
                                            </dd>

                                            <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                Type
                                            </dt>
                                            <dd style={{ fontSize: '12px', margin: 0 }}>
                                                Initial Wallet Funding
                                            </dd>
                                        </dl>
                                    </div>
                                </div>
                            );
                        }

                        // Regular transfer
                        const transfer = event as Transfer;
                        return (
                            <div key={transfer.id} className="deployment-item fade-in" style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    padding: '1rem',
                                    background: 'var(--charcoal-500)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--asi-lime)'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'start',
                                        marginBottom: '0.75rem'
                                    }}>
                                        <h4 style={{ margin: 0, color: 'var(--asi-lime)', fontSize: '1.1rem' }}>
                                            {formatRevAmount(transfer.amount_rev)} {CURRENT_TOKEN}
                                        </h4>
                                        {(transfer.block || transfer.block_number) && (
                                            <Link
                                                to={`/block/${transfer.block?.block_number ?? transfer.block_number}`}
                                                className="btn btn-secondary"
                                                style={{ padding: '4px 12px', fontSize: '13px' }}
                                            >
                                                Block #{transfer.block?.block_number ?? transfer.block_number}
                                            </Link>
                                        )}
                                    </div>

                                    <dl style={{
                                        margin: 0,
                                        display: 'grid',
                                        gridTemplateColumns: '80px 1fr',
                                        gap: '0.5rem',
                                        alignItems: 'start'
                                    }}>
                                        <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                            From
                                        </dt>
                                        <dd className="mono" style={{ fontSize: '11px', margin: 0, wordBreak: 'break-all' }}>
                                            {transfer.from_address}
                                        </dd>

                                        <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                            To
                                        </dt>
                                        <dd className="mono" style={{ fontSize: '11px', margin: 0, wordBreak: 'break-all' }}>
                                            {transfer.to_address}
                                        </dd>

                                        <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                            Time
                                        </dt>
                                        <dd style={{ fontSize: '12px', margin: 0 }}>
                                            {formatTimestamp(
                                                transfer.block?.timestamp ?? transfer.deployment?.timestamp ?? transfer.created_at
                                            )}
                                        </dd>

                                        <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                            Status
                                        </dt>
                                        <dd style={{ fontSize: '12px', margin: 0 }}>
                      <span className={transfer.status === 'success' || transfer.status === 'genesis_bond' ? 'text-success' : 'text-error'}>
                        {transfer.status === 'success' ? '✓ Success' :
                            transfer.status === 'genesis_bond' ? '✓ Genesis Bond' : '✗ Failed'}
                      </span>
                                        </dd>

                                        {transfer.amount_dust !== undefined && transfer.amount_dust !== null && (
                                            <>
                                                <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                    Dust
                                                </dt>
                                                <dd style={{ fontSize: '12px', margin: 0 }}>
                                                    {transfer.amount_dust} dust
                                                </dd>
                                            </>
                                        )}

                                        {transfer.deploy_id && (
                                            <>
                                                <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                    Deploy ID
                                                </dt>
                                                <dd className="mono" style={{ fontSize: '11px', margin: 0, wordBreak: 'break-all' }}>
                                                    {transfer.deploy_id.length > 40
                                                        ? `${transfer.deploy_id.slice(0, 20)}...${transfer.deploy_id.slice(-20)}`
                                                        : transfer.deploy_id}
                                                </dd>
                                            </>
                                        )}

                                        {transfer.block_number !== undefined && (
                                            <>
                                                <dt style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                    Block
                                                </dt>
                                                <dd style={{ fontSize: '12px', margin: 0 }}>
                                                    #{transfer.block_number}
                                                </dd>
                                            </>
                                        )}
                                    </dl>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {totalPages > 1 && (
                <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        <button
                            className="btn btn-secondary"
                            disabled={currentPage === 1}
                            onClick={() => goToPage(currentPage - 1)}
                        >
                            Previous
                        </button>
                        <span>
              Page <span>{currentPage}</span> of <span>{totalPages}</span>
            </span>
                        <button
                            className="btn btn-secondary"
                            disabled={currentPage === totalPages}
                            onClick={() => goToPage(currentPage + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};

export default TransfersPage;
