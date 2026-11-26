import React, { useEffect, useState } from "react";
import { useQuery, gql } from "@apollo/client";
import type { OperationVariables } from "@apollo/client";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
    GET_NETWORK_STATS,
    GET_LATEST_BLOCKS,
    SEARCH_BLOCKS_BY_HASH,
    SEARCH_BLOCKS_BY_NUMBER,
} from "../graphql/queries";
import { Block, NetworkStats } from "../types";
import { formatLocalTime, formatRelativeTime } from "../utils/time";
import { calculateAverageBlockTime } from "../utils/calculateBlockTime";
import RealtimeActivityFeed from "../components/RealtimeActivityFeed";
import RecentDataExporter, { ExportEntities } from "../components/RecentDataExporter";
import SearchField from "../components/SearchField";
import { getBlockPath } from "../utils/blockPath";
import { heightInput } from "../utils/blockHeight";
import { searchPattern } from "../utils/search";
// import { useRealtimeBlocks } from '../services/websocketService';

// Query to get recent blocks for calculating average block time
const GET_RECENT_BLOCKS = gql`
    query GetRecentBlocks {
        blocks(limit: 20, order_by: { block_number: desc }) {
            block_hash
            block_number
            timestamp
        }
    }
`;

function RecentBlocksSkeleton() {
    return (
        <div className="recent-blocks-skeleton" role="status" aria-label="Loading recent blocks">
            <table className="recent-blocks-table" aria-hidden="true">
                <thead className="text-1">
                    <tr>
                        <th scope="col">Height</th>
                        <th scope="col">Block hash</th>
                        <th scope="col">Validator</th>
                        <th scope="col">Time</th>
                        <th scope="col">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 6 }, (_, index) => (
                        <tr key={index}>
                            <td><span className="skeleton skeleton--short" /></td>
                            <td><span className="skeleton skeleton--hash" /></td>
                            <td><span className="skeleton skeleton--validator" /></td>
                            <td><span className="skeleton skeleton--time" /></td>
                            <td><span className="skeleton skeleton--status" /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const HomePage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlQuery = searchParams.get("q") ?? "";
    // Finalized-only is the default; ?finalized=0 is the explicit opt-out.
    const finalizedOnly = searchParams.get("finalized") !== "0";
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState(urlQuery);
    const blocksPerPage = 20;

    useEffect(() => {
        setSearchQuery(urlQuery);
        setCurrentPage(1);
    }, [urlQuery, finalizedOnly]);

    useEffect(() => {
        const query = searchQuery.trim();
        if (query === urlQuery) return;

        const timer = window.setTimeout(() => {
            setSearchParams(previous => {
                const next = new URLSearchParams(previous);
                if (query) next.set("q", query);
                else next.delete("q");
                return next;
            }, { replace: true });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchQuery, urlQuery, setSearchParams]);

    // Get initial network statistics with polling
    const {
        data: statsData,
        loading: statsLoading,
        error: statsError,
        refetch: refetchStats,
    } = useQuery(GET_NETWORK_STATS, {
        pollInterval: 3000, // Poll every 3 seconds
    });

    // Get recent blocks for calculating average block time
    const {
        data: recentBlocksData,
        loading: recentBlocksLoading,
        error: recentBlocksError,
        refetch: refetchRecentBlocks,
    } = useQuery(GET_RECENT_BLOCKS, {
        pollInterval: 5000, // Poll every 5 seconds
    });

    // Get paginated blocks with polling - use search query if present.
    const searchTerm = urlQuery.trim();
    const isSearching = searchTerm.length > 0;
    const isNumericSearch = /^\d+$/.test(searchTerm);
    const filterStatements: object[] = [];
    if (finalizedOnly) {
        filterStatements.push({ finalization_status: { _eq: 'finalized' } });
    }
    const where = filterStatements.length ? { _and: filterStatements } : {};

    // Choose the appropriate query based on search type
    let queryToUse = GET_LATEST_BLOCKS;
    let queryVariables: OperationVariables = {
        // Fetch one extra row to know whether a next page exists without
        // treating a DAG height as a row count.
        limit: blocksPerPage + 1,
        offset: (currentPage - 1) * blocksPerPage,
        where,
    };

    if (isSearching) {
        const exactHeight = heightInput(searchTerm);
        if (isNumericSearch && exactHeight !== null) {
            queryToUse = SEARCH_BLOCKS_BY_NUMBER;
            queryVariables = {
                // Send the exact decimal text; Number/parseInt would round large heights.
                blockNumber: exactHeight,
                limit: blocksPerPage + 1,
                offset: (currentPage - 1) * blocksPerPage,
                where,
            };
        } else {
            queryToUse = SEARCH_BLOCKS_BY_HASH;
            queryVariables = {
                search: searchPattern(searchTerm),
                limit: blocksPerPage + 1,
                offset: (currentPage - 1) * blocksPerPage,
                where,
            };
        }
    }

    const {
        data: blocksQueryData,
        loading: blocksLoading,
        error: blocksError,
        refetch: refetchBlocks,
    } = useQuery(queryToUse, {
        variables: queryVariables,
        // Only a text search pauses polling: its results do not change, while
        // the finalized-only filter keeps showing new finalized blocks.
        pollInterval: isSearching ? 0 : 2000,
    });

    const stats = statsData?.network_stats?.[0] as NetworkStats;
    // The lookahead row only decides whether Next is available.
    const fetchedBlocks = blocksQueryData?.blocks || [];
    const blocks = fetchedBlocks.slice(0, blocksPerPage);
    const hasMore = fetchedBlocks.length > blocksPerPage;

    const formatTimestamp = (timestamp: string | number) => formatRelativeTime(timestamp);

    const truncateHash = (hash: string) => {
        if (!hash || hash.length < 16) return hash;
        return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
    };

    // Calculate average block time from recent blocks
    const avgBlockTime = recentBlocksData?.blocks
        ? calculateAverageBlockTime(recentBlocksData.blocks)
        : null;
    // Use the actual latest block from blocks table, not network_stats
    const latestBlockNumber =
        recentBlocksData?.blocks?.[0]?.block_number ||
        blocks?.[0]?.block_number ||
        "-";

    const overviewError = statsError || recentBlocksError;
    const overviewHasData = Boolean(stats || recentBlocksData);
    const overviewLoading = (statsLoading && !stats) || (recentBlocksLoading && !recentBlocksData);
    const overviewUnavailable = Boolean(overviewError) && !overviewHasData;
    const retryOverview = () => {
        if (statsError) void refetchStats();
        if (recentBlocksError) void refetchRecentBlocks();
    };
    const recentNetworkActive = (recentBlocksData?.blocks?.length || blocks.length) > 0;
    const networkStatusUnavailable = Boolean(recentBlocksError) && !recentBlocksData && blocks.length === 0;
    const blocksUnavailable = Boolean(blocksError) && !blocksQueryData;
    const blocksRefreshing = blocksLoading && Boolean(blocksQueryData);

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            // Filter blocks on current page like old explorer
            setCurrentPage(1); // Reset to first page when searching
        }
    };

    const goToPage = (page: number) => {
        if (Number.isSafeInteger(page) && page >= 1) {
            setCurrentPage(page);
        }
    };

    return (
        <>
            {/* Main Dashboard Grid */}
            <div
                style={{
                    // display: 'grid',
                    // gridTemplateColumns: '2fr 1fr',
                    // gap: '2rem',
                    // marginBottom: '2rem'
                    display: "flex",
                    flexWrap: "wrap",
                    columnGap: "2rem",
                    justifyContent: "center",
                }}
            >
                {/* Left Column - Main Content */}
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                    {overviewError && (
                        <div
                            className={`data-state ${overviewUnavailable ? 'data-state--error' : 'data-state--warning'}`}
                            role={overviewUnavailable ? 'alert' : 'status'}
                        >
                            <AlertTriangle size={16} aria-hidden="true" />
                            <span>
                                {overviewUnavailable
                                    ? 'Network overview is unavailable.'
                                    : 'Some overview data could not be refreshed.'}
                            </span>
                            <button type="button" className="btn btn-secondary data-state__retry" onClick={retryOverview}>
                                <RefreshCw size={14} aria-hidden="true" /> Retry
                            </button>
                        </div>
                    )}
                    {/* Summary Cards Row */}
                    <div className="summary-grid" aria-busy={overviewLoading}>
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                                title="Latest indexed block height"
                            >
                                Latest Height
                            </h3>
                            <h2 className="text-success" style={{ margin: 0 }}>
                                {recentBlocksLoading && !recentBlocksData
                                    ? <span className="skeleton skeleton--stat" aria-hidden="true" />
                                    : latestBlockNumber === "-" ? "—" : latestBlockNumber}
                            </h2>
                        </div>
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                            >
                                Active Validators
                            </h3>
                            <h2 style={{ margin: 0 }}>
                                {statsLoading && !stats
                                    ? <span className="skeleton skeleton--stat" aria-hidden="true" />
                                    : stats?.active_validators || stats?.total_validators || "—"}
                            </h2>
                        </div>
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                            >
                                Avg Block Time
                            </h3>
                            <h2 style={{ margin: 0 }}>
                                {recentBlocksLoading && !recentBlocksData
                                    ? <span className="skeleton skeleton--stat" aria-hidden="true" />
                                    : avgBlockTime !== null ? `${(avgBlockTime as number).toFixed(1)}s` : "N/A"}
                            </h2>
                        </div>
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                            >
                                Network Status
                            </h3>
                            <h2 className={recentNetworkActive ? "text-success" : "text-muted"} style={{ margin: 0 }}>
                                {recentBlocksLoading && !recentBlocksData
                                    ? <span className="skeleton skeleton--stat" aria-hidden="true" />
                                    : networkStatusUnavailable ? "—" : recentNetworkActive ? "Active" : "Inactive"}
                            </h2>
                        </div>
                    </div>
                </div>

                {/* Right Column - Real-time Activity Feed */}
                <RealtimeActivityFeed
                    maxItems={30}
                    showConnectionStatus={false}
                    compact={true}
                    height="400px"
                />
            </div>

            {/* Recent Blocks Section */}
            <section className="asi-card">
                <div className="section-header">
                    <div className="header-content-wrapper">
                        <div className="title">
                            <h1
                                style={
                                    isSearching && searchQuery.length > 20
                                        ? { fontSize: "1.5rem" }
                                        : {}
                                }
                            >
                                {isSearching ? (
                                    <>
                                        Search Results for{" "}
                                        <span
                                            style={{
                                                fontSize: "0.9em",
                                                wordBreak: "break-all",
                                            }}
                                        >
                                            "{searchQuery}"
                                        </span>
                                    </>
                                ) : finalizedOnly ? (
                                    "Finalized Blocks"
                                ) : (
                                    "Recent Blocks"
                                )}
                            </h1>
                        </div>
                    </div>
                    <div className="section-controls">
                        <div className="search-box home-search-box">
                            <SearchField
                                placeholder="Height or hash"
                                aria-label="Filter blocks by height or hash"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyUp={handleSearch}
                            />
                            {searchQuery && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: "8px 16px" }}
                                    onClick={() => {
                                        setSearchQuery("");
                                        setCurrentPage(1);
                                        setSearchParams(previous => {
                                            const next = new URLSearchParams(previous);
                                            next.delete("q");
                                            return next;
                                        });
                                    }}
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                            }}
                        >
                            <span
                                className="status-indicator"
                                style={{ background: "var(--asi-lime)" }}
                            ></span>
                            <h3
                                className="text-muted"  
                            >
                                Live Updates
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="home-filter-row">
                    <label className="home-filter-row__check">
                        <input
                            type="checkbox"
                            checked={finalizedOnly}
                            onChange={(event) => {
                                const checked = event.target.checked;
                                setSearchParams(previous => {
                                    const next = new URLSearchParams(previous);
                                    if (checked) next.delete("finalized");
                                    else next.set("finalized", "0");
                                    return next;
                                });
                            }}
                        />
                        Finalized only
                    </label>
                    {finalizedOnly && (
                        <button
                            type="button"
                            className="home-filter-row__clear"
                            onClick={() => {
                                setSearchParams(previous => {
                                    const next = new URLSearchParams(previous);
                                    next.set("finalized", "0");
                                    return next;
                                });
                            }}
                        >
                            Clear filter
                        </button>
                    )}
                </div>

                <div className="home-status-legend" role="group" aria-label="Block status legend">
                    <span className="home-status-legend__item">
                        <span className="status-dot status-dot--confirmed" aria-hidden="true" />
                        Confirmed
                    </span>
                    <span className="home-status-legend__item">
                        <span className="status-dot status-dot--unfinalized" aria-hidden="true" />
                        Unfinalized
                    </span>
                </div>

                {blocksError && blocksQueryData && (
                    <div className="data-state data-state--warning" role="status">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>Recent blocks could not be refreshed.</span>
                        <button type="button" className="btn btn-secondary data-state__retry" onClick={() => void refetchBlocks()}>
                            <RefreshCw size={14} aria-hidden="true" /> Retry
                        </button>
                    </div>
                )}

                {blocksUnavailable ? (
                    <div className="data-state data-state--error" role="alert">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>Recent blocks are unavailable.</span>
                        <button type="button" className="btn btn-secondary data-state__retry" onClick={() => void refetchBlocks()}>
                            <RefreshCw size={14} aria-hidden="true" /> Retry
                        </button>
                    </div>
                ) : blocksLoading && !blocksQueryData ? (
                    <RecentBlocksSkeleton />
                ) : blocks.length === 0 ? (
                    <div className="text-center" style={{ padding: "3rem" }}>
                        <p className="text-muted">No blocks found</p>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }} aria-busy={blocksRefreshing}>
                        <table className="recent-blocks-table">
                            <thead className="text-1">
                                <tr>
                                    <th scope="col" title="Block height. A height can contain several DAG sibling blocks.">Height</th>
                                    <th scope="col" title="Unique block identifier. Sibling blocks at the same height have different hashes.">Block hash</th>
                                    <th scope="col">Validator</th>
                                    <th scope="col">Time</th>
                                    <th scope="col">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {blocks.map((block: Block, index: number) => {
                                    const previous = blocks[index - 1];
                                    const firstAtHeight = !previous || previous.block_number !== block.block_number;
                                    let groupSize = 1;
                                    if (firstAtHeight) {
                                        for (let next = index + 1; next < blocks.length &&
                                            blocks[next].block_number === block.block_number; next += 1) {
                                            groupSize += 1;
                                        }
                                    }
                                    return (
                                    <tr key={block.block_hash}>
                                        {firstAtHeight && (
                                            <td rowSpan={groupSize} className="height-cell">
                                                <h5>
                                                    <Link
                                                        to={getBlockPath(null, block.block_number)}
                                                        className="block-number"
                                                        aria-label={`Open height ${block.block_number}`}
                                                        title="All blocks at this height"
                                                    >
                                                        {block.block_number}
                                                    </Link>
                                                </h5>
                                                {groupSize > 1 && (
                                                    <span className="height-group-count">
                                                        {groupSize} blocks
                                                    </span>
                                                )}
                                            </td>
                                        )}
                                        <td className="hash-cell">
                                            <Link
                                                className="text-3"
                                                to={getBlockPath(block.block_hash, block.block_number)}
                                                aria-label={`Open block ${block.block_hash}`}
                                                title={block.block_hash}
                                            >
                                                {truncateHash(block.block_hash)}
                                            </Link>
                                        </td>
                                        <td className="text-3 mono validator-cell" title={block.proposer}>
                                            <Link
                                                to="/validators"
                                                title={`View validators for proposer ${block.proposer}`}
                                                aria-label={`View validators for proposer ${block.proposer}`}
                                            >
                                                {truncateHash(block.proposer)}
                                            </Link>
                                        </td>
                                        <td className="timestamp" title={formatLocalTime(block.timestamp)}>
                                            {formatTimestamp(block.timestamp)}
                                        </td>
                                        <td>
                                            {(() => {
                                                const status = block.finalization_status;
                                                const finalized = !status || status === 'finalized';
                                                return (
                                                    <h5 className={finalized ? 'text-success' : 'text-warning'} style={{ textTransform: 'capitalize' }}>
                                                        {finalized ? '✓ Confirmed' : `• ${status?.replace(/_/g, ' ')}`}
                                                    </h5>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {blocks.length > 0 && (
                    <p className="text-muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
                        A height can contain several DAG sibling blocks. The block hash identifies each block.
                    </p>
                )}

                {/* Pagination Controls */}
                {(currentPage > 1 || hasMore) && (
                    <>
                        <div
                            className="pagination-controls"
                            style={{ marginTop: "2rem" }}
                        >
                            <h3>
                                <button
                                    className="btn btn-secondary text-1"
                                    disabled={currentPage === 1}
                                    onClick={() => goToPage(currentPage - 1)}
                                >
                                    ← Previous
                                </button>
                            </h3>
                            <div
                                className="pagination-info"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                }}
                            >
                                <span className="text-muted">Page</span>
                                <input
                                    type="number"
                                    value={currentPage}
                                    min="1"
                                    style={{
                                        width: "80px",
                                        textAlign: "center",
                                    }}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === "") return; // Don't update on empty input
                                        const page = parseInt(value);
                                        if (
                                            !isNaN(page) &&
                                            page >= 1
                                        ) {
                                            goToPage(page);
                                        }
                                    }}
                                    onBlur={(e) => {
                                        // Reset to current page if invalid
                                        if (
                                            e.target.value === "" ||
                                            parseInt(e.target.value) < 1
                                        ) {
                                            e.target.value =
                                                currentPage.toString();
                                        }
                                    }}
                                />
                            </div>
                            <h3>
                                <button
                                    className="btn btn-secondary text-1"
                                    disabled={!hasMore}
                                    onClick={() => goToPage(currentPage + 1)}
                                >
                                    Next →
                                </button>
                            </h3>
                        </div>
                    </>
                )}
                {blocks.length > 0 && (
                    <div className="table-footer">
                        <span className="text-muted">
                            {`Showing ${(currentPage - 1) * blocksPerPage + 1}-${(currentPage - 1) * blocksPerPage + blocks.length} blocks`}
                        </span>
                        <RecentDataExporter entityToExport={ExportEntities.BLOCKS} />
                    </div>
                )}
            </section>
        </>
    );
};

export default HomePage;
