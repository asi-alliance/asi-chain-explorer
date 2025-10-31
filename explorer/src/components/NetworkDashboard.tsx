import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LineChart,
    AreaChart,
    BarChart,
    PieChart,
    Line,
    Area,
    Bar,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ComposedChart,
} from "recharts";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    Users,
    Database,
    Zap,
    Clock,
    Target,
    AlertTriangle,
    CheckCircle,
    DollarSign,
    Layers,
    Globe,
    Shield,
    Cpu,
    HardDrive,
} from "lucide-react";
import { format, subHours, subDays } from "date-fns";
import { gql, useQuery } from "@apollo/client";
import {
    BLOCK_FRAGMENT,
    DEPLOYMENT_FRAGMENT,
    GET_ALL_TRANSFERS,
    GET_LATEST_BLOCKS,
    GET_NETWORK_STATS,
    TRANSFER_FRAGMENT,
} from "../graphql/queries";
import { CURRENT_TOKEN } from "../utils/constants";

interface MetricCard {
    title: string;
    value: string | number;
    change?: number;
    changeType?: "increase" | "decrease";
    icon: React.ReactNode;
    color: string;
    description?: string;
    trend?: number[];
}

interface NetworkHealth {
    overall: "excellent" | "good" | "warning" | "critical";
    score: number;
    metrics: {
        blockTime: { value: number; status: "good" | "warning" | "critical" };
        finalityTime: {
            value: number;
            status: "good" | "warning" | "critical";
        };
        validatorUptime: {
            value: number;
            status: "good" | "warning" | "critical";
        };
        networkLatency: {
            value: number;
            status: "good" | "warning" | "critical";
        };
    };
}

const getLatestBlocksCount = gql`
    query GetLatestBlocksCount($timeRange: bigint!) {
        blocks_aggregate(where: { timestamp: { _gte: $timeRange } }) {
            aggregate {
                count
            }
        }
    }
`;

export const getLatestBlocks = gql`
    ${BLOCK_FRAGMENT}
    ${DEPLOYMENT_FRAGMENT}
    query GetLatestBlocks($limit: Int = 100000, $offset: Int = 0) {
        blocks(
            limit: $limit
            offset: $offset
            order_by: { block_number: desc }
        ) {
            ...BlockFragment
            deployments {
                ...DeploymentFragment
            }
        }
    }
`;

const getTransfersCount = gql`
    query GetTransfersCount($timeRange: bigint!) {
        transfers_aggregate(where: { timestamp: { _gte: $timeRange } }) {
            aggregate {
                count
            }
        }
    }
`;

export const getLastBlock = gql`
    ${BLOCK_FRAGMENT}
    ${DEPLOYMENT_FRAGMENT}
    query GetLatestBlocks($limit: Int = 1, $offset: Int = 0) {
        blocks(
            limit: $limit
            offset: $offset
            order_by: { block_number: desc }
        ) {
            ...BlockFragment
            deployments {
                ...DeploymentFragment
            }
        }
    }
`;

const SECOND_IN_MS_MULTIPLIER: number = 1000;
const DAY_IN_MS_MULTIPLIER: number = 24 * 60 * 60 * SECOND_IN_MS_MULTIPLIER;
const HOUR_IN_MS_MULTIPLIER: number = 60 * 60 * SECOND_IN_MS_MULTIPLIER;

const enum TimeRangeMetrics {
    HOUR = "h",
    DAY = "d",
}

const timeRangeMultiplierRecord: Record<TimeRangeMetrics, number> = {
    [TimeRangeMetrics.HOUR]: HOUR_IN_MS_MULTIPLIER,
    [TimeRangeMetrics.DAY]: DAY_IN_MS_MULTIPLIER,
};

const getTimestampByTimeRangeValue = (rangeValue: string): number => {
    const timeRangeValue: number = Number(
        rangeValue.slice(0, rangeValue.length - 1)
    );
    const timeRangeMetric = rangeValue[
        rangeValue.length - 1
    ] as TimeRangeMetrics;

    const timeRangeMultiplier: number =
        timeRangeMultiplierRecord[timeRangeMetric];

    return Date.now() - timeRangeMultiplier * timeRangeValue;
};

const NetworkDashboard: React.FC = () => {
    const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d">(
        "24h"
    );
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

    const currentTimeRangeTimestamp: number = useMemo(
        () => getTimestampByTimeRangeValue(timeRange),
        [timeRange]
    );

    // Real-time data hooks using GraphQL polling
    const { data: statsData, loading } = useQuery(GET_NETWORK_STATS, {
        variables: {
            timeRange: currentTimeRangeTimestamp,
        },
        pollInterval: 3000,
    });

    const { data: blocksCountData, loading: isBlocksLoading } = useQuery(
        getLatestBlocksCount,
        {
            variables: { timeRange: currentTimeRangeTimestamp },
            pollInterval: 3000,
        }
    );

    const { data: transfersCountData, loading: isTransfersLoading } = useQuery(
        getTransfersCount,
        {
            variables: { timeRange: currentTimeRangeTimestamp },
            pollInterval: 3000,
        }
    );

    const { data: lastBlockData } = useQuery(getLastBlock, {
        pollInterval: 3000,
    });

    const { data: blocksData } = useQuery(GET_LATEST_BLOCKS, {
        pollInterval: 3000,
    });

    const { data: transfersData } = useQuery(GET_ALL_TRANSFERS, {
        variables: { timeRange: currentTimeRangeTimestamp },
        pollInterval: 3000,
    });

    const blocksCount: number = useMemo(
        () => blocksCountData?.blocks_aggregate?.aggregate?.count ?? 0,
        [blocksCountData]
    );
    const transfersCount: number = useMemo(
        () => transfersCountData?.transfers_aggregate?.aggregate?.count ?? 0,
        [transfersCountData]
    );

    const networkStats = statsData?.network_stats?.[0];

    // Calculate historical data from actual blockchain data
    const historicalData = useMemo(() => {
        // Use actual blocks data to calculate metrics
        if (!blocksCount) {
            return [];
        }

        // Group blocks by time intervals based on timeRange
        const now = new Date();
        const hours =
            timeRange === "1h"
                ? 1
                : timeRange === "6h"
                ? 6
                : timeRange === "24h"
                ? 24
                : 168;
        const intervalMs =
            (hours * 60 * 60 * 1000) / (timeRange === "7d" ? 24 : hours); // hourly for 7d, otherwise by hour

        const avgBlockTime =
            (Date.now() - currentTimeRangeTimestamp) /
            blocksCount /
            SECOND_IN_MS_MULTIPLIER;

        // Calculate actual TPS from transfers
        const tps =
            (Date.now() - currentTimeRangeTimestamp) /
            transfersCount /
            SECOND_IN_MS_MULTIPLIER;

        // Get actual validator count
        const activeValidatorCount = networkStats?.active_validators ?? 3;
        const totalValidatorCount = networkStats?.total_validators ?? 3;

        // Create data points for the chart
        const dataPoints = timeRange === "7d" ? 24 : hours; // Hourly for 7d, otherwise one per hour
        return Array.from({ length: dataPoints }, (_, i) => {
            const time = new Date(
                now.getTime() - (dataPoints - i) * intervalMs
            );
            return {
                time: format(time, timeRange === "7d" ? "MMM dd" : "HH:mm"),
                timestamp: time.getTime(),
                blockTime: avgBlockTime,
                tps: Math.max(0, tps),
                activeValidators: activeValidatorCount,
                transfers: Math.floor(transfersCount / dataPoints),
                deployments: 0, // Could fetch actual deployments if needed
                totalStake: totalValidatorCount * 1000, // Each validator has 1000 ASI
            };
        });
    }, [
        timeRange,
        transfersCount,
        networkStats,
        blocksCount,
        currentTimeRangeTimestamp,
    ]);

    // Calculate network health from real metrics
    const networkHealth = useMemo((): NetworkHealth => {
        if (!historicalData || historicalData.length === 0) {
            return {
                overall: "good",
                score: 100,
                metrics: {
                    blockTime: { value: 30, status: "good" },
                    finalityTime: { value: 60, status: "good" },
                    validatorUptime: { value: 100, status: "good" },
                    networkLatency: { value: 150, status: "good" },
                },
            };
        }

        const avgBlockTime = historicalData[0]?.blockTime || 30;
        const activeValidators = networkStats?.active_validators || 3;
        const totalValidators = networkStats?.total_validators || 3;
        const validatorUptime =
            totalValidators > 0
                ? (activeValidators / totalValidators) * 100
                : 100;

        // Status based on actual thresholds
        const blockTimeStatus =
            avgBlockTime < 35
                ? "good"
                : avgBlockTime < 60
                ? "warning"
                : "critical";
        const validatorStatus =
            activeValidators >= 3
                ? "good"
                : activeValidators >= 2
                ? "warning"
                : "critical";
        const uptimeStatus =
            validatorUptime >= 90
                ? "good"
                : validatorUptime >= 70
                ? "warning"
                : "critical";

        const healthScores = {
            good: 100,
            warning: 70,
            critical: 30,
        };

        const avgScore =
            (healthScores[blockTimeStatus] +
                healthScores[validatorStatus] +
                healthScores[uptimeStatus]) /
            3;

        return {
            overall:
                avgScore > 90
                    ? "excellent"
                    : avgScore > 70
                    ? "good"
                    : avgScore > 50
                    ? "warning"
                    : "critical",
            score: avgScore,
            metrics: {
                blockTime: { value: avgBlockTime, status: blockTimeStatus },
                finalityTime: {
                    value: avgBlockTime * 2,
                    status: blockTimeStatus,
                },
                validatorUptime: {
                    value: validatorUptime,
                    status: uptimeStatus,
                },
                networkLatency: { value: 150, status: "good" }, // Default as we don't have this metric
            },
        };
    }, [historicalData, networkStats]);

    // Key metrics calculation from real data
    const keyMetrics = useMemo((): MetricCard[] => {
        const avgBlockTime = historicalData[0]?.blockTime || 30;
        const activeValidators = networkStats?.active_validators || 3;
        const totalValidators = networkStats?.total_validators || 3;

        // Calculate TPS from actual data (transfers per block * blocks per second)
        const tps =
            avgBlockTime > 0 ? transfersCount / blocksCount / avgBlockTime : 0;

        // Total stake from validators (each has 1000 ASI)
        const totalStake = totalValidators * 1000;

        return [
            {
                title: "Block Time",
                value: `${avgBlockTime.toFixed(1)}s`,
                change: 0, // No historical comparison available
                changeType: "increase",
                icon: <Clock size={20} />,
                color: "#10b981",
                description: "Average time between blocks",
                trend: [], // No trend data available
            },
            {
                title: "Transactions/sec",
                value: tps.toFixed(2),
                change: 0,
                changeType: "increase",
                icon: <Zap size={20} />,
                color: "#3b82f6",
                description: "Network throughput",
                trend: [],
            },
            {
                title: "Active Validators",
                value: activeValidators,
                change: 0,
                changeType: "increase",
                icon: <Users size={20} />,
                color: "#8b5cf6",
                description: "Currently validating nodes",
                trend: [],
            },
            {
                title: "Network Health",
                value: `${networkHealth.score.toFixed(0)}%`,
                change: 0,
                changeType: "increase",
                icon: <Activity size={20} />,
                color:
                    networkHealth.overall === "excellent"
                        ? "#10b981"
                        : networkHealth.overall === "good"
                        ? "#3b82f6"
                        : networkHealth.overall === "warning"
                        ? "#f59e0b"
                        : "#ef4444",
                description: "Overall network performance",
            },
            {
                title: "Total Stake",
                value: `${totalStake.toLocaleString()} ${CURRENT_TOKEN}`,
                change: 0,
                changeType: "increase",
                icon: <DollarSign size={20} />,
                color: "#06b6d4",
                description: "Total staked tokens",
            },
            {
                title: "Latest Block",
                value: lastBlockData?.blocks[0]?.block_number || "0",
                change: 0,
                changeType: "increase",
                icon: <Database size={20} />,
                color: "#f59e0b",
                description: "Most recent block",
            },
        ];
    }, [
        historicalData,
        networkHealth,
        networkStats,
        transfersCount,
        blocksCount,
        lastBlockData,
    ]);

    const getHealthColor = (status: string) => {
        switch (status) {
            case "excellent":
                return "#10b981";
            case "good":
                return "#3b82f6";
            case "warning":
                return "#f59e0b";
            case "critical":
                return "#ef4444";
            default:
                return "#6b7280";
        }
    };

    const getHealthIcon = (status: string) => {
        switch (status) {
            case "excellent":
            case "good":
                return <CheckCircle size={20} />;
            case "warning":
                return <AlertTriangle size={20} />;
            case "critical":
                return <AlertTriangle size={20} />;
            default:
                return <Activity size={20} />;
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div
                    className="asi-card"
                    style={{
                        padding: "1rem",
                        minWidth: "200px",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        backgroundColor: "rgba(0, 0, 0, 0.9)",
                    }}
                >
                    <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600" }}>
                        {label}
                    </p>
                    {payload.map((entry: any, index: number) => (
                        <p
                            key={index}
                            style={{
                                margin: "0 0 0.25rem 0",
                                fontSize: "0.875rem",
                                color: entry.color,
                            }}
                        >
                            {entry.name}:{" "}
                            {typeof entry.value === "number"
                                ? entry.value.toFixed(2)
                                : entry.value}
                            {entry.name.includes("Time") && "s"}
                            {entry.name.includes("TPS") && " tx/s"}
                            {entry.name.includes("Latency") && "ms"}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "2rem",
                }}
            >
                <div>
                    <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "32px" }}>
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
                    {(["1h", "6h", "24h", "7d"] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            style={{
                                padding: "0.5rem 1rem",
                                border: "none",
                                borderRadius: "6px",
                                backgroundColor:
                                    timeRange === range
                                        ? "#10b981"
                                        : "transparent",
                                color: timeRange === range ? "#000" : "#9ca3af",
                                cursor: "pointer",
                                fontSize: "16px",
                                fontWeight: "500",
                                transition: "all 0.2s ease",
                            }}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            {/* Network Health Overview */}
            <div className="asi-card" style={{ marginBottom: "2rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "1.5rem",
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: "18px" }}>
                        Network Health
                    </h2>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: getHealthColor(networkHealth.overall),
                        }}
                    >
                        {getHealthIcon(networkHealth.overall)}
                        <span
                            style={{
                                fontWeight: "600",
                                textTransform: "capitalize",
                                fontSize: "18px",
                            }}
                        >
                            {networkHealth.overall}
                        </span>
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "1rem",
                    }}
                >
                    {Object.entries(networkHealth.metrics).map(
                        ([key, metric]) => (
                            <div key={key} className="asi-card glass">
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: "0.5rem",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: "0.875rem",
                                            color: "#9ca3af",
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {key.replace(/([A-Z])/g, " $1")}
                                    </span>
                                    <div
                                        style={{
                                            width: "8px",
                                            height: "8px",
                                            borderRadius: "50%",
                                            backgroundColor: getHealthColor(
                                                metric.status
                                            ),
                                        }}
                                    />
                                </div>
                                <div
                                    style={{
                                        fontSize: "24px",
                                        fontWeight: "600",
                                        color: getHealthColor(metric.status),
                                    }}
                                >
                                    {metric.value.toFixed(1)}
                                    {key.includes("Time") && "s"}
                                    {key.includes("Uptime") && "%"}
                                    {key.includes("Latency") && "ms"}
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Key Metrics Grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "1.5rem",
                    marginBottom: "2rem",
                }}
            >
                {keyMetrics.map((metric, index) => (
                    <motion.div
                        key={metric.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="asi-card"
                        style={{
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                        }}
                        whileHover={{ scale: 1.02 }}
                        onClick={() =>
                            setSelectedMetric(
                                selectedMetric === metric.title
                                    ? null
                                    : metric.title
                            )
                        }
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
                                <div
                                    style={{
                                        fontSize: "24px",
                                        fontWeight: "700",
                                        color: "#fff",
                                        lineHeight: "1",
                                    }}
                                >
                                    {metric.value}
                                </div>
                                {metric.description && (
                                    <div
                                        style={{
                                            fontSize: "14px",
                                            color: "#6b7280",
                                            marginTop: "0.25rem",
                                        }}
                                    >
                                        {metric.description}
                                    </div>
                                )}
                            </div>

                            {metric.change !== undefined && (
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.25rem",
                                        color:
                                            metric.changeType === "increase"
                                                ? "#10b981"
                                                : "#ef4444",
                                    }}
                                >
                                    {metric.changeType === "increase" ? (
                                        <TrendingUp size={16} />
                                    ) : (
                                        <TrendingDown size={16} />
                                    )}
                                    <span
                                        style={{
                                            fontSize: "0.875rem",
                                            fontWeight: "500",
                                        }}
                                    >
                                        {Math.abs(metric.change).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Mini trend chart */}
                        {metric.trend && (
                            <div style={{ height: "60px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={metric.trend.map((value, i) => ({
                                            value,
                                            index: i,
                                        }))}
                                    >
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={metric.color}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            {/* Detailed Charts */}
            {/* <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}> */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "2rem",
                    marginBottom: "2rem",
                }}
            >
                {/* Block Time & TPS Chart */}
                <div className="asi-card" style={{ flex: "auto" }}>
                    <h3 style={{ marginBottom: "1rem", fontSize: "18px" }}>
                        Performance Metrics
                    </h3>
                    <ResponsiveContainer
                        width="100%"
                        height={300}
                        minWidth={300}
                    >
                        <ComposedChart data={historicalData}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(255, 255, 255, 0.1)"
                            />
                            <XAxis
                                dataKey="time"
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="left"
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Area
                                yAxisId="left"
                                type="monotone"
                                dataKey="blockTime"
                                fill="#10b98120"
                                stroke="#10b981"
                                strokeWidth={2}
                                fontSize={12}
                                name="Block Time"
                            />
                            <Line
                                yAxisId="right"
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
                </div>

                {/* Validator Activity */}
                <div className="asi-card" style={{ flex: "auto" }}>
                    <h3 style={{ marginBottom: "1rem", fontSize: "18px" }}>
                        Network Activity
                    </h3>
                    <ResponsiveContainer
                        width="100%"
                        height={300}
                        minWidth={300}
                    >
                        <AreaChart data={historicalData}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(255, 255, 255, 0.1)"
                            />
                            <XAxis
                                dataKey="time"
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="transfers"
                                stackId="1"
                                stroke="#3b82f6"
                                fill="#3b82f6"
                                name="Transfers"
                                fontSize={12}
                            />
                            <Area
                                type="monotone"
                                dataKey="deployments"
                                stackId="1"
                                stroke="#10b981"
                                fill="#10b981"
                                name="Deployments"
                                fontSize={12}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default NetworkDashboard;
