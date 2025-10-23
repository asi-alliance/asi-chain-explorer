import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { AnimatePresence } from "./AnimatePresenceWrapper";
import { useLazyQuery } from "@apollo/client";
import {
    Search,
    Filter,
    X,
    Hash,
    FileText,
    TrendingUp,
    Database,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Block, Transfer, Deployment } from "../types";
import { gql } from "@apollo/client";
import { CURRENT_TOKEN } from "../utils/constants";

const QUICK_SEARCH = gql`
    query QuickSearch(
        $blocks_where: blocks_bool_exp!
        $transfers_where:  transfers_bool_exp!
        $deployments_where: deployments_bool_exp!
    ) {
        blocks(
            where: $blocks_where
            limit: 5
            order_by: { block_number: asc }
        ) {
            block_number
            block_hash
            proposer
            timestamp
        }

        transfers(
            where: $transfers_where
            limit: 5
            order_by: { created_at: desc }
        ) {
            id
            deploy_id
            from_address
            to_address
            amount_asi
            status
            created_at
        }

        # Search deployments by deployer or deploy_id
        deployments(
            where: $deployments_where
            limit: 5
            order_by: { timestamp: desc }
        ) {
            deploy_id
            deployer
            deployment_type
            timestamp
            errored
        }
    }
`;

interface SearchFilters {
    searchType: "all" | "blocks" | "transfers" | "deployments";
    query: string | number;

    // Block filters
    proposer: string;
    minBlockNumber: string;
    maxBlockNumber: string;

    // Transfer filters
    fromAddress: string;
    toAddress: string;
    minAmount: string;
    maxAmount: string;

    // Deployment filters
    deployer: string;
    minPhloCost: string;
    maxPhloCost: string;

    // Date filters
    startDate: string;
    endDate: string;
}

interface SearchResult {
    type: "block" | "transfer" | "deployment";
    data: Block | Transfer | Deployment;
    id: string;
    title: string;
    description: string;
    timestamp: number;
}

interface AdvancedSearchProps {
    embedded?: boolean;
    placeholder?: string;
}

const IGNORE_BLOCKS_WHERE = { block_hash: { _ilike: '' }};
const IGNORE_TRANSFERS_WHERE =  { from_address: { _ilike: '' }}
const IGNORE_DEPLOYMENTS_WHERE = { deploy_id: { _ilike: '' }}

const applyFilters = (accumulator: object[], filters: SearchFilters, statementsMap: any) => {
    for (const [key, value] of Object.entries(filters)) {
        if (!value) {
            continue;
        }

        if (!(key in statementsMap)) {
            continue;
        }

        accumulator.push(statementsMap[key](value));
    }
}

const dateStringToUnix = (date: string) => Math.floor(new Date(date).getTime());

const dateQueryStatements = {
    startDate: (date: string) => ({ timestamp: { _gte: dateStringToUnix(date)}}),
    endDate: (date: string) =>({ timestamp: { _lte: dateStringToUnix(date)}}),
}

const dateTransactionsQueryStatements = {
    startDate: (date: string) => ({ created_at: { _gte: dateStringToUnix(date)}}),
    endDate: (date: string) =>({ created_at: { _lte: dateStringToUnix(date)}}),
}

const blocksQueryStatements = {
    proposer: (proposer: string) => ({ proposer: { _ilike: proposer }}),
    minBlockNumber: (blockNumber: string) => ({ block_number: { _gte: blockNumber }}),
    maxBlockNumber: (blockNumber: string) => ({ block_number: { _lte: blockNumber }}),
}

const deploymentsQueryStatements = {
    deployer: (deployer: string) => ({ deployer: { _ilike: deployer }}),
    minPhloCost: (minPhloCost: string) => ({ phlo_cost: { _gte: minPhloCost }}),
    maxPhloCost: (maxPhloCost: string) => ({ phlo_cost: { _lte: maxPhloCost }}),
}

const transferQueryStatements = {
    fromAddress: (fromAddress: string) => ({ from_address: { _ilike: fromAddress }}),
    toAddress: (toAddress: string) => ({ to_address: { _ilike: toAddress }}),
    minAmount: (minAmount: string) => ({ amount_asi: { _gte: minAmount }}),
    maxAmount: (maxAmount: string) => ({ amount_asi: { _lte: maxAmount }}),
}

const constructBlocksWhere = (searchQuery: string | number, filters: SearchFilters) => {    
    if (filters.searchType !== 'blocks' && filters.searchType !== 'all') {
        return IGNORE_BLOCKS_WHERE;
    }

    const andStatementsArr: object[] = [];

    if (typeof searchQuery === 'number' || typeof searchQuery === 'bigint') {
        andStatementsArr.push({ block_number: { _eq: `${BigInt(searchQuery)}` }})
    } else {
        searchQuery && andStatementsArr.push({ _or: [
            { block_hash: { _ilike: `%${searchQuery}%` }},
            { proposer: { _ilike: `%${searchQuery}%` }}
        ]});
    }
    
    applyFilters(andStatementsArr, filters, blocksQueryStatements);
    applyFilters(andStatementsArr, filters, dateQueryStatements);

    if (andStatementsArr.length === 1) {
        return andStatementsArr[0];
    }

    if (!andStatementsArr.length) {
        return IGNORE_BLOCKS_WHERE;
    }

    return {_and: andStatementsArr};
}

const constructTransfersWhere = (searchQuery: string | number, filters: SearchFilters) => {
    // if (typeof searchQuery === 'number' || typeof searchQuery === 'bigint') {
    //     return IGNORE_TRANSFERS_WHERE;
    // }

    if (filters.searchType !== 'transfers' && filters.searchType !== 'all') {
        return IGNORE_TRANSFERS_WHERE;
    }

    const andStatementsArr: object[] = [];

    searchQuery && andStatementsArr.push({ _or: [
        { from_address: { _ilike: `%${searchQuery}%` }}, 
        { to_address: { _ilike: `%${searchQuery}%` }},
        { deploy_id: { _ilike: `%${searchQuery}%` }}
    ]});

    applyFilters(andStatementsArr, filters, transferQueryStatements);
    applyFilters(andStatementsArr, filters, dateTransactionsQueryStatements);
    
    if (andStatementsArr.length === 1) {
        return andStatementsArr[0];
    }

    if (!andStatementsArr.length) {
        return IGNORE_TRANSFERS_WHERE;
    }

    return {_and: andStatementsArr};
}

const constructDeploymentsWhere = (searchQuery: string | number, filters: SearchFilters) => {

    if (filters.searchType !== 'deployments' && filters.searchType !== 'all') {
        return IGNORE_DEPLOYMENTS_WHERE;
    }

    const andStatementsArr: object[] = [];

    searchQuery && andStatementsArr.push({ _or: [
        { deployer: { _ilike: `%${searchQuery}%` }},
        { deploy_id: { _ilike: `%${searchQuery}%` }}
    ]});

    applyFilters(andStatementsArr, filters, deploymentsQueryStatements);
    applyFilters(andStatementsArr, filters, dateQueryStatements);

    if (andStatementsArr.length === 1) {
        return andStatementsArr[0];
    }

    if (!andStatementsArr.length) {
        return IGNORE_DEPLOYMENTS_WHERE;
    }

    return {_and: andStatementsArr};
}

const constructSearchQuery = (searchQuery: string | number, filters: SearchFilters) => {
    const blocks_where = constructBlocksWhere(searchQuery, filters);
    const deployments_where = constructDeploymentsWhere(searchQuery, filters);
    const transfers_where = constructTransfersWhere(searchQuery, filters);

    return { variables: { blocks_where, transfers_where, deployments_where }}
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
    embedded = false,
    placeholder = "Search blocks, transactions, addresses...",
}) => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [selectedResult, setSelectedResult] = useState<number>(0);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const [filters, setFilters] = useState<SearchFilters>({
        searchType: "all",
        query: "",

        proposer: "",
        minBlockNumber: "",
        maxBlockNumber: "",

        fromAddress: "",
        toAddress: "",
        minAmount: "",
        maxAmount: "",

        deployer: "",
        minPhloCost: "",
        maxPhloCost: "",

        startDate: "",
        endDate: "",
    });

    const [
        quickSearch,
        { data: quickSearchData, loading: quickSearchLoading },
    ] = useLazyQuery(QUICK_SEARCH);

    const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const performSearch = async (
        searchQuery: string | number,
        searchFilters: SearchFilters
    ) => {
        if (!searchQuery.toString().trim() && !hasActiveFilters(searchFilters)) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);

        try {
            await quickSearch(constructSearchQuery(searchQuery, searchFilters));
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const debouncedSearch = useCallback(
        (searchQuery: string | number, searchFilters: SearchFilters) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            debounceRef.current = setTimeout(() => {
                performSearch(searchQuery, searchFilters);
            }, 300);
        },
        []
    );

    const hasActiveFilters = (searchFilters: SearchFilters) => {
        return Object.entries(searchFilters).some(([key, value]) => {
            if (key === "searchType" || key === "query") return false;
            return value !== "" && value !== null;
        });
    };

    // Process search results
    useEffect(() => {
        const results: SearchResult[] = [];

        if (quickSearchData) {
            // Process quick search results
            quickSearchData.blocks?.forEach((block: Block) => {
                results.push({
                    type: "block",
                    data: block,
                    id: `block-${block.block_number}`,
                    title: `Block #${block.block_number}`,
                    description: `Proposed by ${block.proposer.slice(
                        0,
                        12
                    )}...`,
                    timestamp: block.timestamp,
                });
            });

            quickSearchData.transfers?.forEach((transfer: Transfer) => {
                results.push({
                    type: "transfer",
                    data: transfer,
                    id: `transfer-${transfer.id}`,
                    title: `Transfer: ${transfer.amount_asi} ${CURRENT_TOKEN}`,
                    description: `From ${transfer.from_address.slice(
                        0,
                        12
                    )}... to ${transfer.to_address.slice(0, 12)}...`,
                    timestamp: new Date(transfer.created_at).getTime(),
                });
            });

            quickSearchData.deployments?.forEach((deployment: Deployment) => {
                results.push({
                    type: "deployment",
                    data: deployment,
                    id: `deployment-${deployment.deploy_id}`,
                    title: `Deployment by ${deployment.deployer.slice(
                        0,
                        12
                    )}...`,
                    description: deployment.deployment_type || "Unknown type",
                    timestamp: deployment.timestamp,
                });
            });
        }

        // Sort results by timestamp (newest first)
        // results.sort((a, b) => b.timestamp - a.timestamp);

        setSearchResults(results);
    }, [quickSearchData]);
    
    const handleInputChange = (value: string | number) => {
        const newValue = value === "" ? "" : (isNaN(+value) ? value : +value);
         
        setFilters((prev) => ({ ...prev, query: newValue }));
        debouncedSearch(newValue, filters);
        setIsOpen(true);
    };

    const handleFilterChange = (key: keyof SearchFilters, value: any) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        debouncedSearch(newFilters.query, newFilters);
    };

    const handleResultSelect = (result: SearchResult) => {
        setIsOpen(false);
        setSelectedResult(-1);

        switch (result.type) {
            case "block":
                navigate(`/block/${(result.data as Block).block_number}`);
                break;
            case "transfer":
                const transfer = result.data as Transfer;
                navigate(`/transaction/${transfer.deploy_id}`);
                break;
            case "deployment":
                const deploy = result.data as Transfer;                
                navigate(`/transaction/${deploy.deploy_id}`);
                break;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || searchResults.length === 0) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedResult((prev) =>
                    prev < searchResults.length - 1 ? prev + 1 : prev
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedResult((prev) => (prev > 0 ? prev - 1 : -1));
                break;
            case "Enter":
                e.preventDefault();
                if (selectedResult >= 0) {
                    handleResultSelect(searchResults[selectedResult]);
                } else if (searchResults.length > 0) {
                    handleResultSelect(searchResults[0]);
                }
                break;
            case "Escape":
                setIsOpen(false);
                setSelectedResult(-1);
                break;
        }
    };

    const clearFilters = () => {
        setFilters({
            searchType: "all",
            query: "",
            proposer: "",
            minBlockNumber: "",
            maxBlockNumber: "",
            fromAddress: "",
            toAddress: "",
            minAmount: "",
            maxAmount: "",
            deployer: "",
            minPhloCost: "",
            maxPhloCost: "",
            startDate: "",
            endDate: "",
        });
        setSearchResults([]);
        setIsOpen(false);
    };

    const getResultIcon = (type: string) => {
        switch (type) {
            case "block":
                return <Database size={16} style={{ color: "#10b981" }} />;
            case "transfer":
                return <TrendingUp size={16} style={{ color: "#3b82f6" }} />;
            case "deployment":
                return <FileText size={16} style={{ color: "#f59e0b" }} />;
            default:
                return <Hash size={16} />;
        }
    };

    const truncateText = (text: string, maxLength: number = 50) => {
        return text.length > maxLength
            ? `${text.slice(0, maxLength)}...`
            : text;
    };

    return (
        <div
            ref={searchContainerRef}
            style={{ position: "relative", width: "100%" }}
        >
            {/* Main Search Input */}
            <div style={{ position: "relative" }}>
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={placeholder}
                    value={filters.query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsOpen(true)}
                    style={{
                        width: "100%",
                        padding: "0.75rem 3rem 0.75rem 2.5rem",
                        fontSize: "1rem",
                        border: "2px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "12px",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        color: "#fff",
                        transition: "all 0.2s ease",
                        outline: "none",
                    }}
                    className="search-input"
                />

                <Search
                    size={20}
                    style={{
                        position: "absolute",
                        left: "0.75rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#9ca3af",
                    }}
                />

                <div
                    style={{
                        position: "absolute",
                        right: "0.75rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                    }}
                >
                    {/* {(isSearching || quickSearchLoading || blocksLoading || transfersLoading || deploymentsLoading) && ( */}
                    {(isSearching || quickSearchLoading) && (
                        <div
                            className="loading"
                            style={{ width: "16px", height: "16px" }}
                        />
                    )}

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        style={{
                            padding: "0.25rem",
                            border: "none",
                            background: "transparent",
                            color: showFilters ? "#10b981" : "#9ca3af",
                            cursor: "pointer",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        title="Advanced Filters"
                    >
                        <Filter size={16} />
                    </button>

                    {filters.query && (
                        <button
                            onClick={() => {
                                setFilters((prev) => ({ ...prev, query: "" }));
                                setSearchResults([]);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: "0.25rem",
                                border: "none",
                                background: "transparent",
                                color: "#9ca3af",
                                cursor: "pointer",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Advanced Filters Panel */}
            <AnimatePresence>
                <div className="advanced-searcher">
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{
                                marginTop: "0.5rem",
                                padding: "1rem",
                                backgroundColor: "rgba(0, 0, 0, 0.8)",
                                borderRadius: "12px",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                backdropFilter: "blur(10px)",
                                position: "absolute",
                                zIndex: 5,
                                width: "100%",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "1rem",
                                }}
                            >
                                <h4 style={{ margin: 0, color: "#fff" }}>
                                    Filters
                                </h4>
                                <button
                                    onClick={clearFilters}
                                    style={{
                                        padding: "0.5rem 1rem",
                                        border: "1px solid rgba(255, 255, 255, 0.2)",
                                        borderRadius: "6px",
                                        backgroundColor: "transparent",
                                        color: "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "0.875rem",
                                    }}
                                >
                                    Clear All
                                </button>
                            </div>

                            {/* Search Type Filter */}
                            <div style={{ marginBottom: "1rem" }}>
                                <label
                                    style={{
                                        display: "block",
                                        marginBottom: "0.5rem",
                                        fontSize: "0.875rem",
                                        color: "#d1d5db",
                                        fontWeight: "500",
                                    }}
                                >
                                    Search Type
                                </label>
                                <select
                                    value={filters.searchType}
                                    onChange={(e) =>
                                        handleFilterChange(
                                            "searchType",
                                            e.target.value
                                        )
                                    }
                                    style={{
                                        width: "100%",
                                        padding: "0.5rem",
                                        borderRadius: "6px",
                                        border: "1px solid rgba(255, 255, 255, 0.2)",
                                        backgroundColor: "#121313",
                                        color: "#fff",
                                    }}
                                >
                                    <option value="all">All Types</option>
                                    <option value="blocks">Blocks</option>
                                    <option value="transfers">Transfers</option>
                                    <option value="deployments">
                                        Deployments
                                    </option>
                                </select>
                            </div>

                            {/* Date Range Filters */}
                            <div
                                style={{
                                    display: "none",
                                    gridTemplateColumns:
                                        "repeat(auto-fit, minmax(200px, 1fr))",
                                    gap: "1rem",
                                    marginBottom: "1rem",
                                }}
                            >
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            marginBottom: "0.5rem",
                                            fontSize: "0.875rem",
                                            color: "#d1d5db",
                                            fontWeight: "500",
                                        }}
                                    >
                                        Start Date
                                    </label>
                                    <input
                                        disabled
                                        type="date"
                                        value={filters.startDate}
                                        onChange={(e) =>
                                            handleFilterChange(
                                                "startDate",
                                                e.target.value
                                            )
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "0.5rem",
                                            borderRadius: "6px",
                                            border: "1px solid rgba(255, 255, 255, 0.2)",
                                            backgroundColor:
                                                "rgba(255, 255, 255, 0.05)",
                                            color: "#fff",
                                        }}
                                    />
                                </div>
                                <div>
                                    <label
                                        style={{
                                            display: "block",
                                            marginBottom: "0.5rem",
                                            fontSize: "0.875rem",
                                            color: "#d1d5db",
                                            fontWeight: "500",
                                        }}
                                    >
                                        End Date
                                    </label>
                                    <input
                                        disabled
                                        type="date"
                                        value={filters.endDate}
                                        onChange={(e) =>
                                            handleFilterChange(
                                                "endDate",
                                                e.target.value
                                            )
                                        }
                                        style={{
                                            width: "100%",
                                            padding: "0.5rem",
                                            borderRadius: "6px",
                                            border: "1px solid rgba(255, 255, 255, 0.2)",
                                            backgroundColor:
                                                "rgba(255, 255, 255, 0.05)",
                                            color: "#fff",
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Block-specific filters */}
                            {(filters.searchType === "all" ||
                                filters.searchType === "blocks") && (
                                <div style={{ marginBottom: "1rem" }}>
                                    <h5
                                        style={{
                                            margin: "0 0 0.5rem 0",
                                            color: "#10b981",
                                        }}
                                    >
                                        Block Filters
                                    </h5>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                "repeat(auto-fit, minmax(200px, 1fr))",
                                            gap: "0.75rem",
                                        }}
                                    >
                                        <input
                                            type="text"
                                            placeholder="Proposer address"
                                            value={filters.proposer}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "proposer",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Min block number"
                                            value={filters.minBlockNumber}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "minBlockNumber",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Max block number"
                                            value={filters.maxBlockNumber}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "maxBlockNumber",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Transfer-specific filters */}
                            {(filters.searchType === "all" ||
                                filters.searchType === "transfers") && (
                                <div style={{ marginBottom: "1rem" }}>
                                    <h5
                                        style={{
                                            margin: "0 0 0.5rem 0",
                                            color: "#3b82f6",
                                        }}
                                    >
                                        Transfer Filters
                                    </h5>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                "repeat(auto-fit, minmax(200px, 1fr))",
                                            gap: "0.75rem",
                                        }}
                                    >
                                        <input
                                            type="text"
                                            placeholder="From address"
                                            value={filters.fromAddress}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "fromAddress",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="To address"
                                            value={filters.toAddress}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "toAddress",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder={`Min amount (${CURRENT_TOKEN})`}
                                            value={filters.minAmount}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "minAmount",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder={`Max amount (${CURRENT_TOKEN})`}
                                            value={filters.maxAmount}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "maxAmount",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        { /*<select
                                            value={filters.transferStatus}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "transferStatus",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        >
                                            <option value="">Any Status</option>
                                            <option value="success">
                                                Success
                                            </option>
                                            <option value="pending">
                                                Pending
                                            </option>
                                            <option value="failed">
                                                Failed
                                            </option>
                                        </select> */}
                                    </div>
                                </div>
                            )}

                            {/* Deployment-specific filters */}
                            {(filters.searchType === "all" ||
                                filters.searchType === "deployments") && (
                                <div>
                                    <h5
                                        style={{
                                            margin: "0 0 0.5rem 0",
                                            color: "#f59e0b",
                                        }}
                                    >
                                        Deployment Filters
                                    </h5>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns:
                                                "repeat(auto-fit, minmax(200px, 1fr))",
                                            gap: "0.75rem",
                                        }}
                                    >
                                        <input
                                            type="text"
                                            placeholder="Deployer address"
                                            value={filters.deployer}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "deployer",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        {/* <input
                                            type="text"
                                            placeholder="Deployment type"
                                            value={filters.deploymentType}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "deploymentType",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        /> */}
                                        <input
                                            type="number"
                                            placeholder="Min phlo cost"
                                            value={filters.minPhloCost}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "minPhloCost",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Max phlo cost"
                                            value={filters.maxPhloCost}
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "maxPhloCost",
                                                    e.target.value
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        />
                                        {/* <select
                                            value={
                                                filters.errored === null
                                                    ? ""
                                                    : filters.errored.toString()
                                            }
                                            onChange={(e) =>
                                                handleFilterChange(
                                                    "errored",
                                                    e.target.value === ""
                                                        ? null
                                                        : e.target.value ===
                                                              "true"
                                                )
                                            }
                                            style={{
                                                padding: "0.5rem",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                                backgroundColor:
                                                    "rgba(255, 255, 255, 0.05)",
                                                color: "#fff",
                                            }}
                                        >
                                            <option value="">Any Status</option>
                                            <option value="false">
                                                Successful
                                            </option>
                                            <option value="true">Failed</option>
                                        </select> */}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </AnimatePresence>

            {/* Search Results Dropdown */}
            <AnimatePresence>
                {isOpen && (searchResults.length > 0 || isSearching) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            marginTop: "0.5rem",
                            maxHeight: "400px",
                            overflowY: "auto",
                            backgroundColor: "rgba(0, 0, 0, 0.95)",
                            borderRadius: "12px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            backdropFilter: "blur(20px)",
                            zIndex: 1000,
                            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                        }}
                    >
                        {isSearching && (
                            <div
                                style={{
                                    padding: "1rem",
                                    textAlign: "center",
                                    color: "#9ca3af",
                                }}
                            >
                                <div
                                    className="loading"
                                    style={{ marginBottom: "0.5rem" }}
                                />
                                Searching...
                            </div>
                        )}

                        {searchResults.map((result, index) => (
                            <motion.div
                                key={result.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => handleResultSelect(result)}
                                style={{
                                    padding: "0.75rem 1rem",
                                    cursor: "pointer",
                                    borderBottom:
                                        index < searchResults.length - 1
                                            ? "1px solid rgba(255, 255, 255, 0.05)"
                                            : "none",
                                    backgroundColor:
                                        selectedResult === index
                                            ? "rgba(255, 255, 255, 0.1)"
                                            : "transparent",
                                    transition: "background-color 0.2s ease",
                                }}
                                onMouseEnter={() => setSelectedResult(index)}
                                onMouseLeave={() => setSelectedResult(-1)}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: "0.75rem",
                                    }}
                                >
                                    <div style={{ marginTop: "0.125rem" }}>
                                        {getResultIcon(result.type)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: "0.875rem",
                                                fontWeight: "500",
                                                color: "#fff",
                                                marginBottom: "0.25rem",
                                            }}
                                        >
                                            {truncateText(result.title, 60)}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "0.75rem",
                                                color: "#9ca3af",
                                                marginBottom: "0.25rem",
                                            }}
                                        >
                                            {truncateText(
                                                result.description,
                                                80
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "0.75rem",
                                                color: "#6b7280",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.5rem",
                                            }}
                                        >
                                            {/* <Clock size={10} />
                                            {formatDistanceToNow(
                                                new Date(result.timestamp),
                                                { addSuffix: true }
                                            )}
                                            <span
                                                style={{ margin: "0 0.25rem" }}
                                            >
                                                •
                                            </span> */}
                                            <span
                                                style={{
                                                    textTransform: "capitalize",
                                                    color:
                                                        result.type === "block"
                                                            ? "#10b981"
                                                            : result.type ===
                                                              "transfer"
                                                            ? "#3b82f6"
                                                            : "#f59e0b",
                                                }}
                                            >
                                                {result.type}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        {searchResults.length === 0 &&
                            !isSearching &&
                            filters.query && (
                                <div
                                    style={{
                                        padding: "2rem 1rem",
                                        textAlign: "center",
                                        color: "#6b7280",
                                    }}
                                >
                                    <Search
                                        size={32}
                                        style={{
                                            marginBottom: "0.5rem",
                                            opacity: 0.5,
                                        }}
                                    />
                                    <p style={{ margin: 0 }}>
                                        No results found for "{filters.query}"
                                    </p>
                                    <p
                                        style={{
                                            margin: "0.5rem 0 0 0",
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Try adjusting your search terms or
                                        filters
                                    </p>
                                </div>
                            )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdvancedSearch;
