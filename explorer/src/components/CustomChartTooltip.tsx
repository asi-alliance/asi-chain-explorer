import { formatNumber } from "../utils/calculateBlockTime";

const CustomTooltip = ({ active, payload, label }: any) => {
    console.log("TOOLTIP", payload);

    if (!active || !payload || !payload?.length) {
        return null;
    }

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
            <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600" }}>{label}</p>
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
                    {formatNumber(entry.value)}
                    {entry.name.includes("Time") && "s"}
                    {entry.name.includes("TPS") && " tx/s"}
                    {entry.name.includes("Latency") && "ms"}
                </p>
            ))}
        </div>
    );
};

export default CustomTooltip;

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
