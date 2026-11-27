import CustomTooltip from "./CustomChartTooltip";
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    formatDate,
    formatTime,
} from "../utils/calculateBlockTime";
import { groupThousands } from "../utils/amounts";
import { formatLocalTime, formatRelativeTime } from "../utils/time";
import { useIndexerStatus } from "../hooks/useIndexerStatus";
import {
    Activity,
    Database,
    Gauge,
    Hash,
    Zap,
    Clock,
    Server,
    ShieldCheck,
    AlertTriangle,
    RefreshCw,
} from "lucide-react";
import { gql, useQuery } from "@apollo/client";
import { motion } from "framer-motion";
import {
    AreaChart,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ComposedChart,
} from "recharts";

interface MetricCard {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    description?: string;
    descriptionTitle?: string;
    to?: string;
    progress?: number;
    loading?: boolean;
}

interface ChartPoint {
    time: string;
    tps: number;
    blockTime: number;
    transfers: number;
    deployments: number;
}

const GET_STATS = gql`
    query GetStats($hours: Int!, $divisions: Int!) {
        get_network_metrics(
            args: { p_range_hours: $hours, p_divisions: $divisions }
        ) {
            bucket_start
            avg_block_time_seconds
            avg_tps
            deployments_count
            transfers_count
        }

        network_stats(limit: 1, order_by: { id: desc }) {
            id
            total_validators
            active_validators
            validators_in_quarantine
            consensus_participation
            consensus_status
            block_number
            timestamp
        }

        blocks(limit: 1, order_by: { block_number: desc }) {
            block_hash
            block_number
        }
    }
`;

interface ITimeSet {
    value: number;
    divisions: number;
    label: string;
    formatter: (date: Date) => string;
}

enum TimeRanges {
    ONE_HOUR = 1,
    SIX_HOURS = 6,
    ONE_DAY = 24,
    ONE_WEEK = 168,
}

const timeValues: Record<TimeRanges, ITimeSet> = {
    [TimeRanges.ONE_HOUR]: {
        value: TimeRanges.ONE_HOUR,
        label: "1h",
        divisions: 6,
        formatter: formatTime,
    },
    [TimeRanges.SIX_HOURS]: {
        value: TimeRanges.SIX_HOURS,
        label: "6h",
        divisions: 6,
        formatter: formatTime,
    },
    [TimeRanges.ONE_DAY]: {
        value: TimeRanges.ONE_DAY,
        label: "1d",
        divisions: 8,
        formatter: formatTime,
    },
    [TimeRanges.ONE_WEEK]: {
        value: TimeRanges.ONE_WEEK,
        label: "7d",
        divisions: 7,
        formatter: formatDate,
    },
};

const timeSetData: ITimeSet[] = Object.values(timeValues);

/** Keeps large counts readable and tiny rates honest instead of rounding to 0. */
export const formatMetric = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined || value === "") {
        return "—";
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return "—";
    }
    if (numeric === 0) {
        return "0";
    }
    // Below four-decimal precision, print an honest bound rather than 0.0000.
    if (Math.abs(numeric) < 0.0001) {
        return "< 0.01";
    }
    if (Number.isInteger(numeric)) {
        return numeric.toLocaleString("en-US");
    }
    return numeric.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

const ChartEmptyState = ({ message }: { message: string }) => (
    <div
        role="status"
        style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 300,
            color: "#9ca3af",
            fontSize: "0.875rem",
            textAlign: "center",
        }}
    >
        {message}
    </div>
);

const ChartSkeleton = ({ label }: { label: string }) => (
    <div role="status" aria-label={label} style={{ height: 300 }}>
        <span className="skeleton" style={{ width: "100%", height: "100%" }} aria-hidden="true" />
    </div>
);

const NetworkDashboard: React.FC = () => {
    const [timeRange, setTimeRange] = useState<ITimeSet>(
        timeValues[TimeRanges.ONE_DAY]
    );

    const {
        data: stats,
        loading: isStatsLoading,
        error: statsError,
        refetch: refetchStats,
    } = useQuery(GET_STATS, {
        variables: { hours: timeRange.value, divisions: timeRange.divisions },
        pollInterval: 3000,
    });

    const statsUnavailable = Boolean(statsError) && !stats;
    const indexer = useIndexerStatus();

    const keyMetrics = useMemo((): MetricCard[] => {
        const lastBlock = stats?.blocks[0] ?? {};
        const buckets = stats?.get_network_metrics ?? [];
        const lastRecord = buckets[buckets.length - 1] ?? {};
        const network = stats?.network_stats[0];
        const blockNumber = lastBlock.block_number;
        // Heights are Hasura bigints; format the string exactly instead of
        // passing it through Number, which would round above 2^53.
        const blockNumberLabel = blockNumber === undefined || blockNumber === null || blockNumber === ""
            ? "—"
            : groupThousands(String(blockNumber));
        const blockTime = lastRecord.avg_block_time_seconds;
        const activeValidators = network?.active_validators;
        const totalValidators = network?.total_validators;
        const quarantined = network?.validators_in_quarantine;
        const participation = network?.consensus_participation;
        const consensus = network?.consensus_status;
        const statsLoading = isStatsLoading && !stats;

        const indexerStatus = indexer.data;
        const indexerLoading = indexer.loading && !indexer.data;
        const indexerLabel = indexer.loading ? "Loading" : indexerStatus?.label ?? "Unavailable";
        const indexerColor = indexerLabel === "Synced"
            ? "#93e27c"
            : indexerLabel === "Syncing" ? "#3b82f6" : "#f59e0b";
        const indexerDescription = indexerLoading
            ? "Waiting for the indexer"
            : indexer.error
                ? "Status unavailable; retrying"
                : indexerStatus?.label === "Unavailable"
                    ? "The indexer cannot reach the node"
                    : "Checked every 5 seconds";
        // Do not round a nearly caught-up indexer to a misleading 100.00%.
        const progress = indexerStatus?.percentage == null
            ? null
            : Math.floor(indexerStatus.percentage * 100) / 100;
        const lag = indexerStatus?.lag;
        const nodeHeight = indexerStatus?.latestBlock;
        const lagDescription = lag == null
            ? "Node height unknown"
            : `${Math.abs(lag).toLocaleString("en-US")} ${Math.abs(lag) === 1 ? "block" : "blocks"} ${lag < 0 ? "ahead of" : "behind"} node${nodeHeight == null ? "" : ` #${nodeHeight.toLocaleString("en-US")}`}`;
        const indexedHeight = indexerStatus?.lastIndexedBlock;
        const lastUpdate = indexerStatus?.lastUpdate;
        const lastIndexedDescription = lastUpdate
            ? `Last indexed ${formatRelativeTime(lastUpdate)}`
            : "Last indexed time unknown";

        return [
            {
                title: "Latest Height",
                value: blockNumberLabel,
                icon: <Database size={20} />,
                color: "#f59e0b",
                description: "Most recent block height",
                to: blockNumber ? `/height/${blockNumber}` : undefined,
                loading: statsLoading,
            },
            {
                title: "Block Time",
                value: blockTime === undefined || blockTime === null
                    ? "—"
                    : `${formatMetric(blockTime)}s`,
                icon: <Clock size={20} />,
                color: "#10b981",
                description: "Average time between blocks",
                loading: statsLoading,
            },
            {
                title: "Transactions/sec",
                value: formatMetric(lastRecord.avg_tps),
                icon: <Zap size={20} />,
                color: "#3b82f6",
                description: "Network throughput",
                loading: statsLoading,
            },
            {
                title: "Active Validators",
                value: network
                    ? `${formatMetric(activeValidators)} / ${formatMetric(totalValidators)}`
                    : "—",
                icon: <Server size={20} />,
                color: "#3b82f6",
                description: quarantined
                    ? `${formatMetric(quarantined)} in quarantine`
                    : "No validators in quarantine",
                to: "/validators",
                loading: statsLoading,
            },
            {
                title: "Consensus",
                value: consensus
                    ? `${consensus.charAt(0).toUpperCase()}${consensus.slice(1)}`
                    : "—",
                icon: <ShieldCheck size={20} />,
                color: "#a78bfa",
                description: participation
                    ? `${participation}% participation`
                    : "Consensus participation",
                loading: statsLoading,
            },
            {
                title: "Indexer Status",
                value: indexerLabel,
                icon: <Activity size={20} />,
                color: indexerColor,
                description: indexerDescription,
                loading: indexerLoading,
            },
            {
                title: "Sync Progress",
                value: progress == null ? "—" : `${progress.toFixed(2)}%`,
                icon: <Gauge size={20} />,
                color: indexerColor,
                description: lagDescription,
                progress: progress ?? undefined,
                loading: indexerLoading,
            },
            {
                title: "Last Indexed Block",
                value: indexedHeight == null ? "—" : indexedHeight.toLocaleString("en-US"),
                icon: <Hash size={20} />,
                color: "#8b5cf6",
                description: lastIndexedDescription,
                descriptionTitle: lastUpdate ? formatLocalTime(lastUpdate) : undefined,
                to: indexedHeight == null ? undefined : `/height/${indexedHeight}`,
                loading: indexerLoading,
            },
        ];
    }, [stats, indexer, isStatsLoading]);

    const chartsData = useMemo((): ChartPoint[] => {
        if (!stats) {
            return [];
        }

        return (stats?.get_network_metrics ?? []).map((item: any) => ({
            time: timeRange.formatter(new Date(item.bucket_start)),
            tps: Number(item.avg_tps),
            blockTime: Number(item.avg_block_time_seconds),
            transfers: Number(item.transfers_count),
            deployments: Number(item.deployments_count),
        }));
    }, [stats, timeRange]);

    const hasBuckets = chartsData.length > 0;
    const hasActivity = chartsData.some(
        (item) => item.deployments > 0 || item.transfers > 0
    );
    const showSkeletons = isStatsLoading && !stats;
    const indexerAlert = indexer.error
        ? "Indexer status is unavailable. Retrying automatically."
        : indexer.data?.label === "Unavailable"
            ? "The indexer cannot reach the node."
            : indexer.data?.lag != null && indexer.data.lag < 0
                ? "The indexer is ahead of the node. Check that both are using the same network and current chain state."
                : null;

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                    marginBottom: "2rem",
                }}
            >
                <div>
                    <h1 style={{ margin: "0 0 0.5rem 0" }}>
                        Network Dashboard
                    </h1>
                    <p style={{ margin: 0, color: "#9ca3af" }}>
                        Real-time ASI Chain network monitoring and analytics
                    </p>
                </div>

                <div
                    style={{
                        display: "flex",
                        gap: "0.5rem",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px",
                        padding: "0.25rem",
                    }}
                >
                    {timeSetData.map((range) => (
                        <button
                            key={range.value}
                            onClick={() => setTimeRange(range)}
                            className="text-2"
                            aria-pressed={timeRange.value === range.value}
                            style={{
                                padding: "0.5rem 1rem",
                                border: "none",
                                borderRadius: "6px",
                                backgroundColor:
                                    timeRange.value === range.value
                                        ? "#10b981"
                                        : "transparent",
                                color:
                                    timeRange.value === range.value
                                        ? "#000"
                                        : "#9ca3af",
                                cursor: "pointer",
                                fontWeight: "500",
                                transition: "all 0.2s ease",
                            }}
                        >
                            {range.label}
                        </button>
                    ))}
                </div>
            </div>
            {statsError && (
                <div
                    className={`data-state ${statsUnavailable ? "data-state--error" : "data-state--warning"}`}
                    role={statsUnavailable ? "alert" : "status"}
                >
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>
                        {statsUnavailable
                            ? "Statistics are unavailable."
                            : "Some statistics could not be refreshed."}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary data-state__retry"
                        onClick={() => void refetchStats()}
                    >
                        <RefreshCw size={14} aria-hidden="true" /> Retry
                    </button>
                </div>
            )}
            {indexerAlert && (
                <div
                    className={`data-state ${indexer.error ? "data-state--error" : "data-state--warning"}`}
                    role={indexer.error ? "alert" : "status"}
                >
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{indexerAlert}</span>
                </div>
            )}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: "1.5rem",
                }}
                aria-busy={showSkeletons || indexer.loading}
            >
                {keyMetrics.map((metric, index) => (
                    <motion.div
                        key={metric.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="asi-card"
                        style={{
                            transition: "all 0.2s ease",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "1rem",
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                        marginBottom: "0.5rem",
                                    }}
                                >
                                    <div style={{ color: metric.color }}>
                                        {metric.icon}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: "0.875rem",
                                            color: "#9ca3af",
                                        }}
                                    >
                                        {metric.title}
                                    </span>
                                </div>
                                <h2
                                    style={{
                                        margin: 0,
                                        fontWeight: "700",
                                        color: "#fff",
                                        lineHeight: "1",
                                    }}
                                >
                                    {metric.loading ? (
                                        <span
                                            className="skeleton skeleton--stat"
                                            aria-hidden="true"
                                        />
                                    ) : metric.to ? (
                                        <Link
                                            to={metric.to}
                                            style={{
                                                color: "inherit",
                                                textDecoration: "none",
                                            }}
                                        >
                                            {metric.value}
                                        </Link>
                                    ) : (
                                        metric.value
                                    )}
                                </h2>
                                {metric.description && (
                                    <p
                                        title={metric.descriptionTitle}
                                        style={{
                                            margin: "0.25rem 0 0",
                                            color: "#6b7280",
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {metric.description}
                                    </p>
                                )}
                                {metric.progress != null && !metric.loading && (
                                    <div
                                        role="progressbar"
                                        aria-label={`${metric.title} progress`}
                                        aria-valuenow={metric.progress}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        style={{
                                            marginTop: "0.5rem",
                                            height: "4px",
                                            background: "var(--charcoal-400)",
                                            borderRadius: "2px",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${Math.max(0, Math.min(100, metric.progress))}%`,
                                                height: "100%",
                                                background: metric.color,
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "2rem",
                }}
            >
                <div className="text-4 asi-card" style={{ flex: "auto" }}>
                    <h3 style={{ marginBottom: "1rem" }}>
                        Performance Metrics
                    </h3>
                    {showSkeletons ? (
                        <ChartSkeleton label="Loading performance metrics" />
                    ) : !hasBuckets ? (
                        <ChartEmptyState message="No block time data for this range" />
                    ) : (
                        <ResponsiveContainer
                            width="100%"
                            height={300}
                            minWidth={300}
                        >
                            <ComposedChart data={chartsData}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(255, 255, 255, 0.1)"
                                />
                                <XAxis
                                    dataKey="time"
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                    label={{
                                        value:
                                            timeRange.value === TimeRanges.ONE_WEEK
                                                ? "Date"
                                                : "Time",
                                        position: "insideBottomLeft",
                                        offset: -15,
                                    }}
                                />
                                <YAxis
                                    label={{
                                        value: "Block Time (s)",
                                        angle: -90,
                                        position: "insideLeft",
                                        dx: 10,
                                        dy: 40,
                                    }}
                                    yAxisId="blockTime"
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                />
                                <YAxis
                                    label={{
                                        value: "TPS",
                                        angle: 90,
                                        position: "insideRight",
                                        dx: 5,
                                    }}
                                    yAxisId="tps"
                                    orientation="right"
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend align="right" />
                                <Area
                                    yAxisId="blockTime"
                                    type="monotone"
                                    dataKey="blockTime"
                                    fill="#10b98120"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    fontSize={12}
                                    name="Block Time"
                                />
                                <Line
                                    yAxisId="tps"
                                    type="monotone"
                                    dataKey="tps"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                    fontSize={12}
                                    name="TPS"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Validator Activity */}
                <div className="text-4 asi-card" style={{ flex: "auto" }}>
                    <h3 style={{ marginBottom: "1rem" }}>Network Activity</h3>
                    {showSkeletons ? (
                        <ChartSkeleton label="Loading network activity" />
                    ) : !hasBuckets || !hasActivity ? (
                        <ChartEmptyState message="No activity in this range" />
                    ) : (
                        <ResponsiveContainer
                            width="100%"
                            height={300}
                            minWidth={300}
                        >
                            <AreaChart data={chartsData}>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="rgba(255, 255, 255, 0.1)"
                                />
                                <XAxis
                                    dataKey="time"
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                    label={{
                                        value:
                                            timeRange.value === TimeRanges.ONE_WEEK
                                                ? "Date"
                                                : "Time",
                                        position: "insideBottomLeft",
                                        offset: -15,
                                    }}
                                />
                                <YAxis
                                    yAxisId={"deployments"}
                                    label={{
                                        value: "Deployments",
                                        angle: -90,
                                        position: "insideLeft",
                                        dx: -5,
                                        dy: 30,
                                    }}
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                />
                                <YAxis
                                    yAxisId={"transfers"}
                                    orientation="right"
                                    label={{
                                        value: "Transfers",
                                        angle: 90,
                                        position: "insideRight",
                                        dx: -10,
                                        dy: 20,
                                    }}
                                    stroke="#9ca3af"
                                    fontSize={12}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend align="right" />
                                <Line
                                    yAxisId="transfers"
                                    type="monotone"
                                    dataKey="transfers"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                    fontSize={12}
                                    name="Transfers"
                                />
                                <Area
                                    yAxisId={"deployments"}
                                    type="monotone"
                                    className="text-4"
                                    dataKey="deployments"
                                    stackId="1"
                                    stroke="#10b981"
                                    fill="#10b98120"
                                    name="Deployments"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NetworkDashboard;
