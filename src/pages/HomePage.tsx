import React, { useState } from "react";
import { useQuery, gql } from "@apollo/client";
import { Link } from "react-router-dom";
import {
    GET_NETWORK_STATS,
    GET_LATEST_BLOCKS,
    SEARCH_BLOCKS_BY_HASH,
    SEARCH_BLOCKS_BY_NUMBER,
} from "../graphql/queries";
import { Block, NetworkStats } from "../types";
import { formatDistanceToNow } from "date-fns";
import { calculateAverageBlockTime } from "../utils/calculateBlockTime";
import RealtimeActivityFeed from "../components/RealtimeActivityFeed";
import RecentDataExporter, { ExportEntities } from "../components/RecentDataExporter";
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

const HomePage: React.FC = () => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const blocksPerPage = 20;

    // Get initial network statistics with polling
    const { data: statsData, loading: statsLoading } = useQuery(
        GET_NETWORK_STATS,
        {
            pollInterval: 3000, // Poll every 3 seconds
        }
    );

    // Get recent blocks for calculating average block time
    const { data: blocksData } = useQuery(GET_RECENT_BLOCKS, {
        pollInterval: 5000, // Poll every 5 seconds
    });

    // Get paginated blocks with polling - use search query if present
    const isSearching = searchQuery.trim().length > 0;
    const searchTerm = searchQuery.trim();
    const isNumericSearch = /^\d+$/.test(searchTerm);

    // Choose the appropriate query based on search type
    let queryToUse = GET_LATEST_BLOCKS;
    let queryVariables: any = {
        // Fetch one extra row to know whether a next page exists without
        // treating a DAG height as a row count.
        limit: blocksPerPage + 1,
        offset: (currentPage - 1) * blocksPerPage,
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
            };
        } else {
            queryToUse = SEARCH_BLOCKS_BY_HASH;
            queryVariables = {
                search: searchPattern(searchTerm),
                limit: blocksPerPage + 1,
                offset: (currentPage - 1) * blocksPerPage,
            };
        }
    }

    const { data: blocksQueryData, loading: blocksLoading } = useQuery(
        queryToUse,
        {
            variables: queryVariables,
            pollInterval: isSearching ? 0 : 2000, // Don't poll when searching
            skip: isSearching && !searchTerm, // Skip query if searching but no term
        }
    );

    const stats = statsData?.network_stats?.[0] as NetworkStats;
    // The lookahead row only decides whether Next is available.
    const fetchedBlocks = blocksQueryData?.blocks || [];
    const blocks = fetchedBlocks.slice(0, blocksPerPage);
    const hasMore = fetchedBlocks.length > blocksPerPage;

    const formatTimestamp = (timestamp: string | number) => {
        try {
            const ts = parseInt(timestamp.toString());
            const date = new Date(ts);
            if (isNaN(date.getTime())) return "Invalid date";
            return formatDistanceToNow(date, { addSuffix: true });
        } catch (e) {
            return "Invalid date";
        }
    };

    const truncateHash = (hash: string) => {
        if (!hash || hash.length < 16) return hash;
        return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
    };

    // Calculate average block time from recent blocks
    const avgBlockTime = blocksData?.blocks
        ? calculateAverageBlockTime(blocksData.blocks)
        : null;
    // Use the actual latest block from blocks table, not network_stats
    const latestBlockNumber =
        blocksData?.blocks?.[0]?.block_number ||
        blocks?.[0]?.block_number ||
        "-";

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
            {/* Connection Status Indicator */}
            {/* <ConnectionStatus
                position="top-right"
                showDetails={true}
                size="md"
            /> */}

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
                    {/* Summary Cards Row */}
                    <div className="summary-grid">
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                                title="Latest indexed block height"
                            >
                                Latest Height
                            </h3>
                            <h2 className="text-success" style={{ margin: 0 }}>
                                {statsLoading ? "-" : latestBlockNumber}
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
                                {stats?.active_validators ||
                                    stats?.total_validators ||
                                    "-"}
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
                                {avgBlockTime !== null
                                    ? `${(avgBlockTime as number).toFixed(1)}s`
                                    : "N/A"}
                            </h2>
                        </div>
                        <div className="asi-card glass">
                            <h3
                                className="text-muted"
                                style={{ marginBottom: "0.5rem" }}
                            >
                                Network Status
                            </h3>
                            <h2 className="text-success" style={{ margin: 0 }}>
                                {blocks.length > 0 ? "Active" : "Inactive"}
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
                                ) : (
                                    "Recent Blocks"
                                )}
                            </h1>
                        </div>
                        <div className="export-data-container">
                          <RecentDataExporter entityToExport={ExportEntities.BLOCKS} />
                        </div>
                    </div>
                    <div className="section-controls">
                        <div className="search-box">
                            <input
                                className="text-3"
                                type="text"
                                placeholder="Filter by height or hash"
                                style={{
                                    flex: "0 1 300px",
                                    marginRight: "0.5rem",
                                }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyUp={handleSearch}
                            />
                            {isSearching && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: "8px 16px" }}
                                    onClick={() => {
                                        setSearchQuery("");
                                        setCurrentPage(1);
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

                {blocksLoading ? (
                    <div className="text-center">
                        <span className="loading"></span>
                        <p className="text-muted mt-2">Loading blocks...</p>
                    </div>
                ) : blocks.length === 0 ? (
                    <div className="text-center" style={{ padding: "3rem" }}>
                        <p className="text-muted">No blocks found</p>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table>
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
                                        <td className="text-3 mono" title={block.proposer}>
                                            {truncateHash(block.proposer)}
                                        </td>
                                        <td className="timestamp">
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
                {!blocksLoading && blocks.length > 0 && (
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
                        <div style={{ marginTop: "1rem", textAlign: "center" }}>
                            <span className="text-muted">
                                {blocks.length
                                    ? `Showing ${(currentPage - 1) * blocksPerPage + 1}-${(currentPage - 1) * blocksPerPage + blocks.length} blocks`
                                    : "No blocks on this page"}
                            </span>
                        </div>
                    </>
                )}
            </section>
        </>
    );
};

export default HomePage;
