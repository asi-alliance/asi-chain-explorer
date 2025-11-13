/**
 * Calculate average block time from recent blocks
 */
export function calculateAverageBlockTime(
    blocks: Array<{ timestamp: string | number }>
): number | null {
    if (!blocks || blocks.length < 2) return null;

    // Sort blocks by timestamp (oldest first)
    const sortedBlocks = [...blocks].sort((a, b) => {
        const timeA =
            typeof a.timestamp === "string"
                ? parseInt(a.timestamp)
                : a.timestamp;
        const timeB =
            typeof b.timestamp === "string"
                ? parseInt(b.timestamp)
                : b.timestamp;
        return timeA - timeB;
    });

    let totalTime = 0;
    let count = 0;

    for (let i = 1; i < sortedBlocks.length; i++) {
        const currentTime =
            typeof sortedBlocks[i].timestamp === "string"
                ? parseInt(sortedBlocks[i].timestamp as string)
                : (sortedBlocks[i].timestamp as number);
        const prevTime =
            typeof sortedBlocks[i - 1].timestamp === "string"
                ? parseInt(sortedBlocks[i - 1].timestamp as string)
                : (sortedBlocks[i - 1].timestamp as number);

        const timeDiff = (currentTime - prevTime) / 1000; // Convert to seconds

        // Only count reasonable block times (between 1 and 60 seconds)
        if (timeDiff > 0 && timeDiff < 60) {
            totalTime += timeDiff;
            count++;
        }
    }

    return count > 0 ? totalTime / count : null;
}

/**
 * Calculate earliest and latest block times from blocks
 */
export function getBlockTimeRange(
    blocks: Array<{ timestamp: string | number }>
): {
    earliest: number | null;
    latest: number | null;
} {
    if (!blocks || blocks.length === 0) {
        return { earliest: null, latest: null };
    }

    const timestamps = blocks.map((b) =>
        typeof b.timestamp === "string" ? parseInt(b.timestamp) : b.timestamp
    );

    return {
        earliest: Math.min(...timestamps),
        latest: Math.max(...timestamps),
    };
}

export const toMillis = (input: string | number | undefined | null): number => {
    if (input == null) return NaN;

    if (typeof input === "number" && Number.isFinite(input)) {
        // Detect seconds vs milliseconds by magnitude
        return input > 1e12 ? input : input * 1000;
    }

    if (typeof input === "string") {
        const s = input.trim();

        // Pure digits → numeric epoch (seconds or milliseconds)
        if (/^\d+$/.test(s)) {
            const n = Number(s);
            return n > 1e12 ? n : n * 1000;
        }

        // ISO-like string: trim microseconds to milliseconds
        let normalized = s.replace(/(\.\d{3})\d+/, "$1"); // "....350416" → "....350"
        // If there's time but no timezone, assume UTC
        if (
            /[T ]\d{2}:\d{2}:\d{2}/.test(normalized) &&
            !/[zZ]$/.test(normalized) &&
            !/[+-]\d{2}:\d{2}$/.test(normalized)
        ) {
            normalized += "Z";
        }

        const ms = Date.parse(normalized); // returns ms
        return Number.isNaN(ms) ? NaN : ms;
    }

    return NaN;
};

export const fromCogs = (value: number, decimals: number = 8): number => {
    return value / 10 ** decimals;
};

export const formatNumber = (value: string | number | undefined) => {
    if (!value) {
        return 0;
    }

    const numericValue = Number(value);

    return Number.isInteger(numericValue)
        ? numericValue
        : numericValue.toFixed(4);
};

export const formatTime = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes()
    ).padStart(2, "0")}`;

export const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    });
