import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { gql, useApolloClient } from "@apollo/client";
import { formatDistanceToNow } from "date-fns";
import {
    ChevronRight,
    Clock,
    Database,
    FileText,
    Hash,
    Search,
    TrendingUp,
    Wallet,
    X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { addressPath, isVaultAddress } from "../utils/addressPath";
import { decimalText, groupThousands, truncateDecimal } from "../utils/amounts";
import { heightInput } from "../utils/blockHeight";
import { getBlockPath } from "../utils/blockPath";
import { CURRENT_TOKEN } from "../utils/constants";
import { useRecentSearches } from "../hooks/useRecentSearches";
import { HEIGHT_ONLY_PATTERN, searchPattern } from "../utils/search";
import "../styles/search.css";

const QUICK_SEARCH = gql`
    query QuickSearch($pattern: String!, $height: bigint!, $sig: String!) {
        blocks(
            where: {
                _or: [
                    { block_hash: { _ilike: $pattern } }
                    { proposer: { _ilike: $pattern } }
                    { block_number: { _eq: $height } }
                ]
            }
            limit: 6
            order_by: { block_number: desc }
        ) {
            block_number
            block_hash
            proposer
            timestamp
        }


        transfers(
            where: {
                _or: [
                    { deploy_id: { _ilike: $pattern } }
                    { from_address: { _ilike: $pattern } }
                    { to_address: { _ilike: $pattern } }
                    { block_number: { _eq: $height } }
                ]
            }
            limit: 6
            order_by: { timestamp: desc }
        ) {
            id
            deploy_id
            block_number
            timestamp
            from_address
            to_address
            amount_asi
            status
        }

        deployments(
            where: {
                _or: [
                    { deploy_id: { _ilike: $pattern } }
                    { deployer: { _ilike: $pattern } }
                    { deployer_address: { _ilike: $pattern } }
                    { block_number: { _eq: $height } }
                ]
            }
            limit: 6
            order_by: { timestamp: desc }
        ) {
            deploy_id
            block_number
            timestamp
            deployer
            deployer_address
            errored
        }

        pending_deploys(where: { sig: { _eq: $sig } }, limit: 1) {
            sig
            deployer_address
            timestamp
            is_rejected
            phlo_limit
            phlo_price
            expiration_timestamp
            included_deployment {
                deploy_id
            }
        }
    }
`;

// The query asks for six rows per stream so the panel can show five and mark the
// group as truncated.
const VISIBLE_PER_GROUP = 5;
const DEBOUNCE_MS = 300;
const MIN_TEXT_LENGTH = 2;

interface QuickBlock {
    block_number: string;
    block_hash: string;
    proposer: string;
    timestamp: string | number;
}

interface QuickTransfer {
    id: string;
    deploy_id: string;
    block_number: string;
    timestamp: string | number;
    from_address: string;
    to_address: string;
    amount_asi: string | number;
    status?: string | null;
}

interface QuickDeployment {
    deploy_id: string;
    block_number: string;
    timestamp: string | number;
    deployer: string;
    deployer_address?: string | null;
    errored?: boolean | null;
}

interface QuickPendingDeploy {
    sig: string;
    deployer_address: string;
    timestamp: string | number;
    is_rejected: boolean;
    phlo_limit?: string | number | null;
    phlo_price?: string | number | null;
    expiration_timestamp?: string | number | null;
    included_deployment?: { deploy_id: string } | null;
}

interface QuickSearchData {
    blocks?: QuickBlock[];
    transfers?: QuickTransfer[];
    deployments?: QuickDeployment[];
    pending_deploys?: QuickPendingDeploy[];
}

type ResultType = "height" | "pending" | "block" | "transaction" | "transfer";

interface QuickResult {
    key: string;
    type: ResultType;
    path: string;
    title: string;
    meta: string;
    timestamp: number;
    status?: string;
    rank: number;
}

interface ResultGroup {
    key: string;
    label: string;
    items: QuickResult[];
    truncated: boolean;
}

interface AdvancedSearchProps {
    embedded?: boolean;
    placeholder?: string;
    variant?: "header" | "palette";
    autoFocus?: boolean;
    showRecent?: boolean;
    onNavigate?: () => void;
}

const shorten = (value: string, head = 10, tail = 6): string => {
    if (!value) return "";
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
};

const timestampOf = (value: string | number): number => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
};

const relativeTime = (timestamp: number): string => {
    if (!timestamp) return "";
    try {
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
        return "";
    }
};

const formatAmount = (value: string | number): string => {
    try {
        return groupThousands(truncateDecimal(decimalText(value), 8));
    } catch {
        return String(value);
    }
};

const isAbortError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError";

const optionId = (result: QuickResult): string =>
    `asi-search-option-${result.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    const needle = query.trim();
    if (needle.length < MIN_TEXT_LENGTH) return <>{text}</>;
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, index)}
            <mark className="asi-search__match">{text.slice(index, index + needle.length)}</mark>
            {text.slice(index + needle.length)}
        </>
    );
};

const rankOf = (values: string[], needle: string): number => {
    if (!needle) return 2;
    const normalized = values.map((value) => String(value ?? "").toLowerCase());
    if (normalized.some((value) => value === needle)) return 0;
    if (normalized.some((value) => value.startsWith(needle))) return 1;
    return 2;
};

function buildResults(data: QuickSearchData | undefined, query: string): QuickResult[] {
    const needle = query.trim().toLowerCase();
    const transfers = data?.transfers ?? [];
    const deployments = data?.deployments ?? [];
    const transferByDeploy = new Map<string, QuickTransfer>();
    for (const transfer of transfers) {
        if (!transferByDeploy.has(transfer.deploy_id)) {
            transferByDeploy.set(transfer.deploy_id, transfer);
        }
    }
    const deploymentIds = new Set(deployments.map((deployment) => deployment.deploy_id));

    // A numeric query is a height, not a block identifier: one height can hold
    // several DAG siblings, so send the user to the height page first.
    const exactHeight = heightInput(query.trim());
    // The public schema does not expose blocks_aggregate. The quick query asks
    // for six rows, so a full batch means "six or more", not an exact count.
    const loadedBlocks = data?.blocks?.length ?? 0;
    const heightMeta = loadedBlocks > 0
        ? loadedBlocks >= 6
            ? "6+ blocks at this height"
            : `${loadedBlocks} block${loadedBlocks === 1 ? "" : "s"} at this height`
        : "View all blocks at this height";
    const heightResults: QuickResult[] = exactHeight === null ? [] : [{
        key: `height:${exactHeight}`,
        type: "height",
        path: `/block/${exactHeight}`,
        title: `Height #${exactHeight}`,
        meta: heightMeta,
        timestamp: 0,
        rank: 0,
    }];

    const blocks: QuickResult[] = (data?.blocks ?? []).map((block) => ({
        key: `block:${block.block_hash}`,
        type: "block",
        path: getBlockPath(block.block_hash, block.block_number),
        title: `Block #${block.block_number}`,
        meta: shorten(block.block_hash, 12, 8),
        timestamp: timestampOf(block.timestamp),
        rank: rankOf([String(block.block_number), block.block_hash, block.proposer], needle),
    }));

    const transactions: QuickResult[] = deployments.map((deployment) => {
        const transfer = transferByDeploy.get(deployment.deploy_id);
        const counterparties = transfer
            ? `${shorten(transfer.from_address, 6, 4)} → ${shorten(transfer.to_address, 6, 4)}`
            : shorten(deployment.deployer_address || deployment.deployer, 6, 4);
        return {
            key: `transaction:${deployment.deploy_id}`,
            type: "transaction",
            path: `/transaction/${encodeURIComponent(deployment.deploy_id)}`,
            title: `Transaction ${shorten(deployment.deploy_id, 12, 8)}`,
            meta: [`Block #${deployment.block_number}`, counterparties].filter(Boolean).join(" · "),
            timestamp: timestampOf(deployment.timestamp),
            status: deployment.errored ? "failed" : undefined,
            rank: rankOf(
                [
                    String(deployment.block_number),
                    deployment.deploy_id,
                    deployment.deployer,
                    deployment.deployer_address ?? "",
                ],
                needle
            ),
        };
    });

    const transferResults: QuickResult[] = transfers
        // A transaction row already links to the same page and carries its amount context.
        .filter((transfer) => !deploymentIds.has(transfer.deploy_id))
        .map((transfer) => ({
            key: `transfer:${transfer.id}`,
            type: "transfer",
            path: `/transaction/${encodeURIComponent(transfer.deploy_id)}`,
            title: `${formatAmount(transfer.amount_asi)} ${CURRENT_TOKEN}`,
            meta: [`Block #${transfer.block_number}`, `${shorten(transfer.from_address, 6, 4)} → ${shorten(transfer.to_address, 6, 4)}`]
                .filter(Boolean)
                .join(" · "),
            timestamp: timestampOf(transfer.timestamp),
            status: transfer.status && transfer.status !== "success" ? transfer.status : undefined,
            rank: rankOf(
                [String(transfer.block_number), transfer.deploy_id, transfer.from_address, transfer.to_address],
                needle
            ),
        }));

    const pending = data?.pending_deploys?.[0];
    const pendingIndexed = pending !== undefined && (
        deploymentIds.has(pending.sig) ||
        transfers.some((transfer) => transfer.deploy_id === pending.sig) ||
        pending.included_deployment?.deploy_id !== undefined
    );
    const pendingResults: QuickResult[] = pending && !pendingIndexed ? [{
        key: `pending:${pending.sig}`,
        type: "pending",
        path: `/transaction/${encodeURIComponent(pending.sig)}`,
        title: `Pending deploy ${shorten(pending.sig, 10, 8)}`,
        meta: pending.is_rejected ? "Rejected; retrying" : "Waiting in validator buffer",
        timestamp: timestampOf(pending.timestamp),
        status: pending.is_rejected ? "rejected" : "pending",
        rank: 0,
    }] : [];

    const byRankThenTime = (left: QuickResult, right: QuickResult) =>
        left.rank - right.rank || right.timestamp - left.timestamp;

    return [
        ...heightResults,
        ...pendingResults,
        ...blocks.sort(byRankThenTime),
        ...transactions.sort(byRankThenTime),
        ...transferResults.sort(byRankThenTime),
    ];
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
    embedded = false,
    placeholder = "Search block, tx, or address",
    variant = "header",
    autoFocus = false,
    showRecent = false,
    onNavigate,
}) => {
    const client = useApolloClient();
    const navigate = useNavigate();
    const location = useLocation();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const requestRef = useRef<AbortController | null>(null);
    const lastPathnameRef = useRef(location.pathname);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<QuickResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const { recent, add: addRecent, clear: clearRecent } = useRecentSearches();

    const trimmed = query.trim();
    const wallet = isVaultAddress(trimmed);
    // A single digit is a valid height, but a single letter is too broad to query.
    const tooShort = trimmed.length > 0 && trimmed.length < MIN_TEXT_LENGTH && !/^\d+$/.test(trimmed);
    const shortcut = useMemo(() => {
        if (typeof navigator === "undefined") return "Ctrl K";
        return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
    }, []);

    const runSearch = useCallback(
        async (value: string) => {
            requestRef.current?.abort();
            const controller = new AbortController();
            requestRef.current = controller;
            setLoading(true);
            setError(null);

            try {
                const exactHeight = heightInput(value);
                const { data } = await client.query<QuickSearchData>({
                    query: QUICK_SEARCH,
                    variables: {
                        pattern: exactHeight === null ? searchPattern(value) : HEIGHT_ONLY_PATTERN,
                        // Heights are non-negative; -1 disables the height branch for text queries.
                        height: exactHeight ?? "-1",
                        // Exact signature lookup; the pending table is keyed by sig.
                        sig: value.trim(),
                    },
                    fetchPolicy: "no-cache",
                    errorPolicy: "none",
                    context: {
                        fetchOptions: { signal: controller.signal },
                        queryDeduplication: false,
                    },
                });
                if (!controller.signal.aborted) {
                    setResults(buildResults(data, value));
                    setActiveIndex(-1);
                }
            } catch (caught) {
                if (!controller.signal.aborted && !isAbortError(caught)) {
                    console.error("Search error:", caught);
                    setResults([]);
                    setError(caught instanceof Error ? caught : new Error("Search failed"));
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        },
        [client]
    );

    useEffect(() => {
        requestRef.current?.abort();
        requestRef.current = null;
        setActiveIndex(-1);
        setError(null);

        if (!trimmed) {
            setResults([]);
            setLoading(false);
            return;
        }

        if (tooShort || wallet) {
            setResults([]);
            setLoading(false);
            return;
        }

        // Show the searching state during the debounce instead of stale rows.
        setResults([]);
        setLoading(true);
        const timer = window.setTimeout(() => {
            void runSearch(trimmed);
        }, DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
            requestRef.current?.abort();
        };
    }, [runSearch, tooShort, trimmed, wallet]);

    useEffect(() => {
        if (lastPathnameRef.current === location.pathname) return;
        lastPathnameRef.current = location.pathname;
        requestRef.current?.abort();
        requestRef.current = null;
        setQuery("");
        setResults([]);
        setError(null);
        setLoading(false);
        setIsOpen(false);
        setActiveIndex(-1);
    }, [location.pathname]);

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsidePress = (event: MouseEvent | TouchEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", closeOnOutsidePress);
        document.addEventListener("touchstart", closeOnOutsidePress);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsidePress);
            document.removeEventListener("touchstart", closeOnOutsidePress);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!autoFocus) return;
        inputRef.current?.focus();
        setIsOpen(true);
    }, [autoFocus]);

    const groups = useMemo<ResultGroup[]>(() => {
        const heights = results.filter((result) => result.type === "height");
        const pending = results.filter((result) => result.type === "pending");
        const blocks = results.filter((result) => result.type === "block");
        const transactions = results.filter((result) => result.type === "transaction");
        const transfers = results.filter((result) => result.type === "transfer");
        return [
            { key: "height", label: "Height", items: heights, truncated: false },
            { key: "pending", label: "Pending", items: pending, truncated: false },
            { key: "blocks", label: "Blocks", items: blocks.slice(0, VISIBLE_PER_GROUP), truncated: blocks.length > VISIBLE_PER_GROUP },
            { key: "transactions", label: "Transactions", items: transactions.slice(0, VISIBLE_PER_GROUP), truncated: transactions.length > VISIBLE_PER_GROUP },
            { key: "transfers", label: "Transfers", items: transfers.slice(0, VISIBLE_PER_GROUP), truncated: transfers.length > VISIBLE_PER_GROUP },
        ].filter((group) => group.items.length > 0);
    }, [results]);

    const visibleResults = useMemo(
        () => groups.flatMap((group) => group.items),
        [groups]
    );
    const activeResult = activeIndex >= 0 ? visibleResults[activeIndex] : undefined;

    useEffect(() => {
        if (!activeResult) return;
        document.getElementById(optionId(activeResult))?.scrollIntoView?.({ block: "nearest" });
    }, [activeResult]);

    const searchUrl = useMemo(() => {
        if (!trimmed) return "/search";
        return `/search?${new URLSearchParams({ q: trimmed }).toString()}`;
    }, [trimmed]);

    const close = () => {
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const openResult = (result: QuickResult) => {
        addRecent(trimmed);
        close();
        onNavigate?.();
        navigate(result.path);
    };

    const openSearchPage = () => {
        if (!trimmed) return;
        addRecent(trimmed);
        close();
        onNavigate?.();
        navigate(searchUrl);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            if (isOpen) {
                event.preventDefault();
                close();
            }
            return;
        }

        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            openSearchPage();
            return;
        }

        if (wallet && event.key === "Enter") {
            event.preventDefault();
            addRecent(trimmed);
            close();
            onNavigate?.();
            navigate(addressPath(trimmed));
            return;
        }

        if (!isOpen) {
            if (event.key === "ArrowDown" && trimmed) {
                event.preventDefault();
                setIsOpen(true);
            } else if (event.key === "Enter" && trimmed) {
                event.preventDefault();
                openSearchPage();
            }
            return;
        }

        if (!visibleResults.length) {
            if (event.key === "Enter" && trimmed) {
                event.preventDefault();
                openSearchPage();
            }
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                setActiveIndex((current) =>
                    current < visibleResults.length - 1 ? current + 1 : current
                );
                break;
            case "ArrowUp":
                event.preventDefault();
                setActiveIndex((current) => (current > 0 ? current - 1 : -1));
                break;
            case "Home":
                event.preventDefault();
                setActiveIndex(0);
                break;
            case "End":
                event.preventDefault();
                setActiveIndex(visibleResults.length - 1);
                break;
            case "Enter":
                event.preventDefault();
                openResult(activeResult ?? visibleResults[0]);
                break;
        }
    };

    const clear = () => {
        requestRef.current?.abort();
        requestRef.current = null;
        setQuery("");
        setResults([]);
        setError(null);
        setLoading(false);
        close();
        inputRef.current?.focus();
    };

    const panelOpen = isOpen;
    const showIdleHint = !trimmed && !wallet;

    const iconFor = (type: ResultType) => {
        if (type === "height") return <Hash size={16} aria-hidden="true" />;
        if (type === "pending") return <Clock size={16} aria-hidden="true" />;
        if (type === "block") return <Database size={16} aria-hidden="true" />;
        if (type === "transaction") return <FileText size={16} aria-hidden="true" />;
        return <TrendingUp size={16} aria-hidden="true" />;
    };

    const activeDescendant = activeResult ? optionId(activeResult) : undefined;

    return (
        <div
            ref={containerRef}
            className={`asi-search${embedded ? " asi-search--embedded" : ""}${variant === "palette" ? " asi-search--palette" : ""}`}
            onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && !event.currentTarget.contains(next)) close();
            }}
        >
            <div className="asi-search__field" onClick={() => inputRef.current?.focus()}>
                <Search className="asi-search__leading" size={18} aria-hidden="true" />
                <input
                    ref={inputRef}
                    className="asi-search__input"
                    type="search"
                    role="combobox"
                    aria-label="Search blocks, transactions, and wallet addresses"
                    aria-autocomplete="list"
                    aria-expanded={panelOpen}
                    aria-controls={panelOpen ? "asi-search-results" : undefined}
                    aria-activedescendant={activeDescendant}
                    placeholder={placeholder}
                    title={placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                />

                <div className="asi-search__actions">
                    {loading && (
                        <span className="loading asi-search__spinner" aria-hidden="true" />
                    )}
                    {!query && !isOpen && (
                        <kbd className="asi-search__kbd" aria-hidden="true">{shortcut}</kbd>
                    )}
                    {query && (
                        <button
                            type="button"
                            className="asi-search__clear"
                            aria-label="Clear search"
                            onClick={clear}
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            <p className="asi-search__sr-only" role="status" aria-live="polite">
                {loading
                    ? "Searching"
                    : error
                      ? "Search is temporarily unavailable"
                      : trimmed && !wallet
                        ? results.length
                            ? `${results.length} result${results.length === 1 ? "" : "s"}`
                            : "No results"
                        : ""}
            </p>

            {panelOpen && (
                <div id="asi-search-results" className="asi-search__panel">
                    <div className="asi-search__scroll">
                        {wallet && (
                            <Link
                                className="asi-search__wallet"
                                to={addressPath(trimmed)}
                                onClick={() => {
                                    addRecent(trimmed);
                                    close();
                                    onNavigate?.();
                                }}
                            >
                                <span className="asi-search__icon asi-search__icon--wallet">
                                    <Wallet size={18} aria-hidden="true" />
                                </span>
                                <span className="asi-search__wallet-body">
                                    <span className="asi-search__wallet-title">Wallet address</span>
                                    <span className="asi-search__wallet-address" title={trimmed}>
                                        {shorten(trimmed, 14, 10)}
                                    </span>
                                </span>
                                <span className="asi-search__wallet-action">
                                    View balance
                                    <ChevronRight size={14} aria-hidden="true" />
                                </span>
                            </Link>
                        )}

                        {!wallet && loading && (
                            <div className="asi-search__skeletons" aria-hidden="true">
                                {[0, 1, 2].map((row) => (
                                    <div className="asi-search__skeleton" key={row}>
                                        <span className="asi-search__skeleton-icon" />
                                        <span className="asi-search__skeleton-lines">
                                            <span />
                                            <span />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!wallet && !loading && error && (
                            <div className="asi-search__state" role="alert">
                                <p className="asi-search__state-title">Search is temporarily unavailable.</p>
                                <p>Check your connection and try again.</p>
                                <button
                                    type="button"
                                    className="asi-search__retry"
                                    onClick={() => void runSearch(trimmed)}
                                >
                                    Try again
                                </button>
                            </div>
                        )}

                        {!wallet && !loading && !error && tooShort && (
                            <div className="asi-search__state">
                                <p className="asi-search__state-title">Keep typing…</p>
                                <p>Enter at least 2 characters, or a block height.</p>
                            </div>
                        )}

                        {!wallet && !loading && !error && !tooShort && trimmed && results.length === 0 && (
                            <div className="asi-search__state">
                                <Search size={28} className="asi-search__state-icon" aria-hidden="true" />
                                <p className="asi-search__state-title">No results for “{trimmed}”</p>
                                <p>Try a block height or hash, a transaction ID, or a wallet address.</p>
                            </div>
                        )}

                        {!wallet && !loading && !error && results.length > 0 && (
                            <div
                                className="asi-search__list"
                                role="listbox"
                                aria-label="Search results"
                            >
                                {groups.map((group) => (
                                    <div
                                        key={group.key}
                                        className="asi-search__group"
                                        role="group"
                                        aria-labelledby={`asi-search-group-${group.key}`}
                                    >
                                        <div
                                            className="asi-search__group-head"
                                            id={`asi-search-group-${group.key}`}
                                        >
                                            <span>{group.label}</span>
                                            <span className="asi-search__count">
                                                {group.items.length}
                                                {group.truncated ? "+" : ""}
                                            </span>
                                        </div>
                                        {group.items.map((result) => {
                                            const index = visibleResults.indexOf(result);
                                            const active = index === activeIndex;
                                            return (
                                                <Link
                                                    key={result.key}
                                                    id={optionId(result)}
                                                    className={`asi-search__row${active ? " is-active" : ""}`}
                                                    to={result.path}
                                                    role="option"
                                                    aria-label={[result.title, result.meta, result.status].filter(Boolean).join(". ")}
                                                    aria-selected={active}
                                                    tabIndex={-1}
                                                    onMouseEnter={() => setActiveIndex(index)}
                                                    onClick={() => {
                                                        addRecent(trimmed);
                                                        close();
                                                        onNavigate?.();
                                                    }}
                                                >
                                                    <span className={`asi-search__icon asi-search__icon--${result.type}`}>
                                                        {iconFor(result.type)}
                                                    </span>
                                                    <span className="asi-search__row-body">
                                                        <span className="asi-search__title">
                                                            <Highlight text={result.title} query={trimmed} />
                                                        </span>
                                                        <span className="asi-search__meta" title={result.meta}>
                                                            <Highlight text={result.meta} query={trimmed} />
                                                        </span>
                                                    </span>
                                                    <span className="asi-search__side">
                                                        {result.status && (
                                                            <span className={`asi-search__badge asi-search__badge--${result.status}`}>
                                                                {result.status}
                                                            </span>
                                                        )}
                                                        {result.timestamp > 0 && (
                                                            <time dateTime={new Date(result.timestamp).toISOString()}>
                                                                {relativeTime(result.timestamp)}
                                                            </time>
                                                        )}
                                                    </span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}

                        {showRecent && !trimmed && recent.length > 0 && (
                            <div className="asi-search__recent">
                                <div className="asi-search__recent-head">
                                    <span>Recent searches</span>
                                    <button type="button" onClick={clearRecent}>Clear</button>
                                </div>
                                {recent.map((item) => (
                                    <button
                                        key={`${item.query}-${item.at}`}
                                        type="button"
                                        className="asi-search__recent-item"
                                        onClick={() => {
                                            setQuery(item.query);
                                            setIsOpen(true);
                                            inputRef.current?.focus();
                                        }}
                                    >
                                        {item.query}
                                    </button>
                                ))}
                            </div>
                        )}

                        {showIdleHint && !loading && !error && !(showRecent && recent.length > 0) && (
                            <div className="asi-search__state asi-search__state--idle">
                                <p className="asi-search__state-title">Search the chain</p>
                                <p>Block height or hash, transaction ID, or wallet address.</p>
                                <p className="asi-search__examples">
                                    <code>12345</code> · <code>0ab3…cdef</code> · <code>1111…</code>
                                </p>
                            </div>
                        )}
                    </div>

                    {!wallet && results.length > 0 && (
                        <div className="asi-search__footer">
                            <span className="asi-search__keys" aria-hidden="true">
                                <kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> close
                            </span>
                            <Link
                                className="asi-search__all"
                                to={searchUrl}
                                onClick={() => {
                                    addRecent(trimmed);
                                    onNavigate?.();
                                    close();
                                }}
                            >
                                See all results
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AdvancedSearch;
