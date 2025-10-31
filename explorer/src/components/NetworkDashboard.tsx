import React, { useState, useMemo } from "react";
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
import {
    Database,
    Zap,
    Clock,
} from "lucide-react";
import { format } from "date-fns";
import { gql, useQuery } from "@apollo/client";
import {
    BLOCK_FRAGMENT,
    DEPLOYMENT_FRAGMENT,
    GET_ALL_TRANSFERS,
    GET_LATEST_BLOCKS,
    GET_NETWORK_STATS,
} from "../graphql/queries";

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
    const { data: statsData } = useQuery(GET_NETWORK_STATS, {
        variables: {
            timeRange: currentTimeRangeTimestamp,
        },
        pollInterval: 3000,
    });

    const { data: blocksCountData } = useQuery(
        getLatestBlocksCount,
        {
            variables: { timeRange: currentTimeRangeTimestamp },
            pollInterval: 3000,
        }
    );

    const { data: transfersCountData } = useQuery(
        getTransfersCount,
        {
            variables: { timeRange: currentTimeRangeTimestamp },
            pollInterval: 3000,
        }
    );

    const { data: lastBlockData } = useQuery(getLastBlock, {
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

    const keyMetrics = useMemo((): MetricCard[] => {
        
        const avgBlockTime = historicalData[0]?.blockTime || 0;
        const activeValidators = networkStats?.active_validators || 0;

        // Calculate TPS from actual data (transfers per block * blocks per second)
        const tps =
            avgBlockTime > 0 ? transfersCount / blocksCount / avgBlockTime : 0;


        return [
            {
                title: "Latest Block",
                value: lastBlockData?.blocks[0]?.block_number || "0",
                change: 0,
                changeType: "increase",
                icon: <Database size={20} />,
                color: "#f59e0b",
                description: "Most recent block",
            },
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
                icon: <Zap size={20} />,
                color: "#3b82f6",
                description: "Network throughput",
                trend: [],
            },
        ];
    }, [
        historicalData,
        networkStats,
        transfersCount,
        blocksCount,
        lastBlockData,
    ]);

    // const getHealthColor = (status: string) => {
    //     switch (status) {
    //         case "excellent":
    //             return "#10b981";
    //         case "good":
    //             return "#3b82f6";
    //         case "warning":
    //             return "#f59e0b";
    //         case "critical":
    //             return "#ef4444";
    //         default:
    //             return "#6b7280";
    //     }
    // };

    // const getHealthIcon = (status: string) => {
    //     switch (status) {
    //         case "excellent":
    //         case "good":
    //             return <CheckCircle size={20} />;
    //         case "warning":
    //             return <AlertTriangle size={20} />;
    //         case "critical":
    //             return <AlertTriangle size={20} />;
    //         default:
    //             return <Activity size={20} />;
    //     }
    // };

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

            {/* Key Metrics Grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    columnGap: "1.5rem",
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
