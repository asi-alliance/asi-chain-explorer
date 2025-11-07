import CustomTooltip from "./CustomChartTooltip";
import React, { useState, useMemo, useCallback } from "react";
import {
    formatDate,
    formatNumber,
    formatTime,
} from "../utils/calculateBlockTime";
import { Database, Zap, Clock, Server } from "lucide-react";
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
    change?: number;
    changeType?: "increase" | "decrease";
    icon: React.ReactNode;
    color: string;
    description?: string;
    trend?: number[];
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

const NetworkDashboard: React.FC = () => {
    const [timeRange, setTimeRange] = useState<ITimeSet>(
        timeValues[TimeRanges.ONE_DAY]
    );

    const { data: stats, loading: isStatsLoading } = useQuery(GET_STATS, {
        variables: { hours: timeRange.value, divisions: timeRange.divisions },
        pollInterval: 3000,
    });

    const getValue = useCallback(
        (value: string) => {
            if (isStatsLoading) {
                return "-";
            }

            return value;
        },
        [isStatsLoading]
    );

    const keyMetrics = useMemo((): MetricCard[] => {
        const lastBlock = stats?.blocks[0] ?? {};
        const lastRecord =
            stats?.get_network_metrics[
                stats?.get_network_metrics?.length - 1
            ] ?? {};
        const activeValidators =
            stats?.network_stats[0]?.active_validators || 0;

        return [
            {
                title: "Latest Block",
                value: getValue(lastBlock?.block_number || "0"),
                change: 0,
                changeType: "increase",
                icon: <Database size={20} />,
                color: "#f59e0b",
                description: "Most recent block",
            },
            {
                title: "Block Time",
                value: getValue(
                    `${formatNumber(lastRecord?.avg_block_time_seconds)}s`
                ),
                change: 0, // No historical comparison available
                changeType: "increase",
                icon: <Clock size={20} />,
                color: "#10b981",
                description: "Average time between blocks",
                trend: [], // No trend data available
            },
            {
                title: "Transactions/sec",
                value: getValue(`${formatNumber(lastRecord?.avg_tps)}`),
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
                icon: <Server size={20} />,
                color: "#3b82f6",
                description: "Network throughput",
                trend: [],
            },
        ];
    }, [stats, getValue]);

    const chartsData = useMemo(() => {
        if (!stats) {
            return [];
        }

        return stats?.get_network_metrics.map((item: any) => ({
            time: timeRange.formatter(new Date(item.bucket_start)),
            tps: item.avg_tps,
            blockTime: item.avg_block_time_seconds,
            transfers: item.transfers_count,
            deployments: item.deployments_count,
        }));
    }, [stats, timeRange]);

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
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
                                        fontWeight: "700",
                                        color: "#fff",
                                        lineHeight: "1",
                                    }}
                                >
                                    {metric.value}
                                </h2>
                                {metric.description && (
                                    <h5
                                        style={{
                                            color: "#6b7280",
                                            marginTop: "0.25rem",
                                        }}
                                    >
                                        {metric.description}
                                    </h5>
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
                                    offset: "-15",
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
                </div>

                {/* Validator Activity */}
                <div className="text-4 asi-card" style={{ flex: "auto" }}>
                    <h3 style={{ marginBottom: "1rem" }}>Network Activity</h3>
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
                                    offset: "-15",
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
                </div>
            </div>
        </div>
    );
};

export default NetworkDashboard;
