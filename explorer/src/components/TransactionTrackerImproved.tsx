import React, {
    useState,
    useMemo,
    useRef,
} from "react";
import { useQuery, gql, useLazyQuery } from "@apollo/client";
import { motion } from "framer-motion";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  ArrowRightLeft,
  Activity,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CURRENT_TOKEN } from '../utils/constants';
import { toMillis } from "../utils/calculateBlockTime";

// GraphQL Queries
const GET_TRANSACTION_COUNTS = gql`
    query GetTransactionCounts {
        deployments_aggregate {
            aggregate {
                count
            }
        }
        transfers_aggregate {
            aggregate {
                count
            }
        }
    }
`;

const SEARCH_TRANSACTIONS = gql`
  query SEARCH_TRANSACTIONS($query: String!) {
        transfers(
            where: {
                _or: [
                    { from_address: { _ilike: $query } }
                    { to_address: { _ilike: $query } }
                    { deploy_id: { _ilike: $query } }
                ]
            }
            limit: 30
            order_by: { created_at: desc }
        ) {
            id
            deploy_id
            from_address
            to_address
            amount_asi
            status
            created_at
            block_number
        }

        # Search deployments by deployer or deploy_id
        deployments(
            where: {
                _or: [
                    { deployer: { _ilike: $query } }
                    { deploy_id: { _ilike: $query } }
                    { block_hash: { _ilike: $query } }
                ]
            }
            limit: 30
            order_by: { timestamp: desc }
        ) {
            deploy_id
            deployer
            deployment_type
            block_number
            timestamp
            errored
        }
    }
`;

const GET_PAGINATED_TRANSACTIONS = gql`
    query GetPaginatedTransactions(
        $deploymentLimit: Int!
        $deploymentOffset: Int!
        $transferLimit: Int!
        $transferOffset: Int!
    ) {
        deployments(
            limit: $deploymentLimit
            offset: $deploymentOffset
            order_by: { timestamp: desc }
        ) {
            deploy_id
            deployer
            term
            timestamp
            deployment_type
            phlo_cost
            phlo_price
            phlo_limit
            status
            block_number
            errored
            error_message
        }
        transfers(
            limit: $transferLimit
            offset: $transferOffset
            order_by: { created_at: desc }
        ) {
            id
            deploy_id
            from_address
            to_address
            amount_asi
            status
            block_number
            created_at
        }
    }
`;

interface TransactionTrackerImprovedProps {
    onTransactionSelect?: (transaction: any) => void;
    embedded?: boolean;
}

const TransactionTrackerImproved: React.FC<TransactionTrackerImprovedProps> = ({
    onTransactionSelect,
    embedded = false,
}) => {
    const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
    // State
    const [activeTab, setActiveTab] = useState<"deployments" | "transfers">(
        "deployments"
    );
    // const [activeTab, setActiveTab] = useState<'all' | 'deployments' | 'transfers'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [searchQuery, setSearchQuery] = useState("");

    // Fetch total counts
    const { data: countsData } = useQuery(GET_TRANSACTION_COUNTS, {
        pollInterval: 30000, // Update counts every 30 seconds
    });
    
    const [
        searchTransactions,
        { data: transactionsSearchData, loading: areTransactionsSearching },
    ] = useLazyQuery(SEARCH_TRANSACTIONS);

    const totalDeployments = countsData?.deployments_aggregate?.aggregate?.count || 0;
    const totalTransfers = countsData?.transfers_aggregate?.aggregate?.count || 0;

    const totalSearchDeployments = (() => {
      if (!searchQuery) {
        return totalDeployments;
      }
      
      return transactionsSearchData?.deployments?.length || 0;
    })()
      

    const totalSearchTransfers = (() => {
      if(!searchQuery) {
        return totalTransfers;
      }

      return transactionsSearchData?.transfers?.length || 0
    })()         

    const totalTransactions = totalDeployments + totalTransfers;

    // Calculate pagination
    const deploymentOffset =
        activeTab === "transfers" ? 0 : (currentPage - 1) * itemsPerPage;
    const transferOffset =
        activeTab === "deployments" ? 0 : (currentPage - 1) * itemsPerPage;
    const deploymentLimit = activeTab === "transfers" ? 0 : itemsPerPage;
    const transferLimit = activeTab === "deployments" ? 0 : itemsPerPage;


    const {
        data: transactionData,
        loading,
    } = useQuery(GET_PAGINATED_TRANSACTIONS, {
        variables: {
            deploymentLimit,
            deploymentOffset,
            transferLimit,
            transferOffset,
        },
        pollInterval: embedded ? 0 : 10000, // Poll every 10 seconds if not embedded
    });

    const debouncedSearch = (value: string | number) => {      
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            searchTransactions({
                variables: {
                    query: `%${value}%`,
                },
            });
        }, 500);
    };


    const handleSearchQueryChange = (value: string) => {
      setSearchQuery(value);
      debouncedSearch(value);
    }
    /** Normalize any time-like value to epoch milliseconds. */
    const toMillis = (input: string | number | undefined | null): number => {
        if (input == null) return NaN;

        if (typeof input === 'number' && Number.isFinite(input)) {
            // Detect seconds vs milliseconds by magnitude
            return input > 1e12 ? input : input * 1000;
        }

        if (typeof input === 'string') {
            const s = input.trim();

            // Pure digits → numeric epoch (seconds or milliseconds)
            if (/^\d+$/.test(s)) {
                const n = Number(s);
                return n > 1e12 ? n : n * 1000;
            }

            // ISO-like string: trim microseconds to milliseconds
            let normalized = s.replace(/(\.\d{3})\d+/, '$1'); // "....350416" → "....350"
            // If there's time but no timezone, assume UTC
            if (/[T ]\d{2}:\d{2}:\d{2}/.test(normalized) && !/[zZ]$/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized)) {
                normalized += 'Z';
            }

            const ms = Date.parse(normalized); // returns ms
            return Number.isNaN(ms) ? NaN : ms;
        }

        return NaN;
    };

    const searchResults = useMemo(() => {

      const results: any[] = [];

      if (activeTab === "deployments") {
            transactionsSearchData?.deployments?.forEach((deployment: any) => {
                results.push({
                    ...deployment,
                    type: "deployment",
                    id: deployment.deploy_id,
                    displayTitle: `Deploy by ${deployment.deployer.slice(
                        0,
                        8
                    )}...`,
                    displayTime: deployment.timestamp,
                    isError: deployment.errored,
                });
            });
        }

        // if (activeTab === 'all' || activeTab === 'transfers') {
        if (activeTab === "transfers") {
            transactionsSearchData?.transfers?.forEach((transfer: any) => {
                results.push({
                    ...transfer,
                    type: "transfer",
                    id: transfer.id,
                    displayTitle: `Transfer ${transfer.amount_asi} ${CURRENT_TOKEN}`,
                    displayTime: transfer.created_at,
                    isError: transfer.status !== "success",
                });
            });
        }

      return results.sort((a, b) => {
            const timeA = parseInt(a.displayTime);
            const timeB = parseInt(b.displayTime);
            return timeB - timeA;
      });
    }, [transactionsSearchData, activeTab])

    const transactions = useMemo(() => {

        if (searchQuery) {
          return searchResults;
        }

        if (!transactionData){
          return []
        }

        const results: any[] = [];

        // if (activeTab === 'all' || activeTab === 'deployments') {
        if (activeTab === "deployments") {
            transactionData.deployments?.forEach((deployment: any) => {
                results.push({
                    ...deployment,
                    type: "deployment",
                    id: deployment.deploy_id,
                    displayTitle: `Deploy by ${deployment.deployer.slice(
                        0,
                        8
                    )}...`,
                    displayTime: deployment.timestamp,
                    isError: deployment.errored,
                });
            });
        }

        // if (activeTab === 'all' || activeTab === 'transfers') {
        if (activeTab === "transfers") {
            transactionData.transfers?.forEach((transfer: any) => {
                results.push({
                    ...transfer,
                    type: "transfer",
                    id: transfer.id,
                    displayTitle: `Transfer ${transfer.amount_asi} ${CURRENT_TOKEN}`,
                    displayTime: transfer.created_at,
                    isError: transfer.status !== "success",
                });
            });
        }

        return results.sort((a, b) => {
            const timeA = parseInt(a.displayTime);
            const timeB = parseInt(b.displayTime);
            return timeB - timeA;
        });
    }, [searchQuery, searchResults, transactionData, activeTab]);

    // Calculate pagination info
    const totalItemsForTab =
        activeTab === "deployments"
            ? totalDeployments
            : activeTab === "transfers"
            ? totalTransfers
            : totalTransactions;

    const totalPages = Math.ceil(totalItemsForTab / itemsPerPage);
    // const startIndex = (currentPage - 1) * itemsPerPage + 1;
    // const endIndex = Math.min(currentPage * itemsPerPage, totalItemsForTab);

    // Get heading text based on context
    const getHeadingText = () => {
        // if (activeTab === 'all') {
        //   return {
        //     title: "All Transactions",
        //     subtitle: `Showing ${startIndex}-${Math.min(endIndex, transactions.length)} of ${totalTransactions} total (${totalDeployments} deployments, ${totalTransfers} transfers)`
        //   };
        // } else if (activeTab === 'deployments') {
        if (activeTab === "deployments") {
            return {
                title: "Smart Contract Deployments",
                subtitle: "",
                // subtitle: `Showing ${startIndex}-${endIndex} of ${totalDeployments} total deployments`,
            };
        } else {
            return {
                title: "Token Transfers",
                subtitle: "",
                // subtitle: `Showing ${startIndex}-${endIndex} of ${totalTransfers} total transfers`,
            };
        }
    };

    const heading = getHeadingText();

    return (
        <div className={embedded ? "" : "asi-card"}>
            {/* Header */}
            <div style={{ marginBottom: "2rem" }}>
                <h1 style={{ margin: "0 0 0.5rem 0" }}>{heading.title}</h1>
                <p
                    style={{
                        margin: 0,
                        color: "#9ca3af",
                    }}
                >
                    {heading.subtitle}
                </p>
            </div>

            {/* Summary Stats Bar */}
            {!embedded && (
                <div
                    style={{
                        display: "flex",
                        gap: "1rem",
                        marginBottom: "2rem",
                        padding: "1rem",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                        }}
                    >
                        <FileText size={16} style={{ color: "#f59e0b" }} />
                        <h3>{totalDeployments} Deployments</h3>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                        }}
                    >
                        <ArrowRightLeft
                            size={16}
                            style={{ color: "#3b82f6" }}
                        />
                        <h3>{totalTransfers} Transfers</h3>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                        }}
                    >
                        <Activity size={16} style={{ color: "#10b981" }} />
                        <h3>{totalTransactions} Total</h3>
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    marginBottom: "2rem",
                }}
            >
                {/* {(['all', 'deployments', 'transfers'] as const).map((tab) => ( */}
                {(["deployments", "transfers"] as const).map((tab) => (
                    <button
                        className="text-1"
                        key={tab}
                        onClick={() => {
                            setActiveTab(tab);
                            setCurrentPage(1);
                        }}
                        style={{
                            padding: "0.75rem 1rem",
                            background: "none",
                            border: "none",
                            borderBottom:
                                activeTab === tab
                                    ? "2px solid #10b981"
                                    : "2px solid transparent",
                            color: activeTab === tab ? "#10b981" : "#9ca3af",
                            cursor: "pointer",
                            textTransform: "capitalize",
                            fontWeight: activeTab === tab ? "600" : "400",
                        }}
                    >
                        {/* {tab === 'all' ? `All (${totalTransactions})` 
              : tab === 'deployments' ? `Deployments (${totalDeployments})`
              : `Transfers (${totalTransfers})`} */}
                        {tab === "deployments"
                            ? `Deployments (${searchQuery ? totalSearchDeployments : totalDeployments})`
                            : `Transfers (${searchQuery ? totalSearchTransfers : totalTransfers})`}
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: "2rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                        className="text-3"
                        type="text"
                        placeholder="Search by ID, address, or block hash..."
                        value={searchQuery}
                        onChange={(e) => {handleSearchQueryChange(e.target.value)}}
                        style={{
                            flex: 1,
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            color: "#fff",
                        }}
                    />
                </div>
            </div>

            {/* Transaction List */}
            <div style={{ marginBottom: "2rem" }}>
                {loading || areTransactionsSearching ? (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                        <RefreshCw size={24} className="spinning" />
                        <p>Loading transactions...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "3rem" }}>
                        <Activity
                            size={48}
                            style={{ color: "#6b7280", marginBottom: "1rem" }}
                        />
                        <h4>No transactions found</h4>
                        <p style={{ color: "#9ca3af" }}>
                            {areTransactionsSearching
                                ? "Try adjusting your search criteria"
                                : "Transactions will appear here as they occur"}
                        </p>
                    </div>
                ) : (
                    <div>
                        {transactions.map((tx, index) => (
                            <motion.div
                                key={`${tx.type}-${tx.id}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.02 }}
                                className="asi-card glass"
                                style={{
                                    marginBottom: "1rem",
                                    padding: "1rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "1rem",
                                }}
                                onClick={() => onTransactionSelect?.(tx)}
                            >
                                {/* Type Badge */}
                                <h5
                                    style={{
                                        padding: "0.25rem 0.5rem",
                                        borderRadius: "4px",
                                        backgroundColor:
                                            tx.type === "deployment"
                                                ? "rgba(245, 158, 11, 0.2)"
                                                : "rgba(59, 130, 246, 0.2)",
                                        color:
                                            tx.type === "deployment"
                                                ? "#f59e0b"
                                                : "#3b82f6",
                                        fontWeight: "600",
                                    }}
                                >
                                    {tx.type === "deployment"
                                        ? "DEPLOY"
                                        : "TRANSFER"}
                                </h5>

                                {/* Transaction Info */}
                                <div style={{ flex: 1 }}>
                                    <h5
                                        style={{
                                            fontWeight: "500",
                                            marginBottom: "0.25rem",
                                        }}
                                    >
                                        {tx.displayTitle}
                                    </h5>
                                    <div
                                        style={{
                                            fontSize: "0.875rem",
                                            color: "#9ca3af",
                                        }}
                                    >
                                        Block #{tx.block_number} •{" "}
                                        {formatDistanceToNow(
                                            new Date(toMillis(tx.displayTime)),
                                            { addSuffix: true }
                                        )}
                                    </div>
                                </div>

                                {/* Status Icon */}
                                <div>
                                    {tx.isError ? (
                                        <XCircle
                                            size={20}
                                            style={{ color: "#ef4444" }}
                                        />
                                    ) : (
                                        <CheckCircle
                                            size={20}
                                            style={{ color: "#10b981" }}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            <div className="pagination-controls">
                {(totalPages > 1 && !searchQuery) && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "1rem",
                            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                        }}
                    >
                        {/* <div style={{ color: "#9ca3af", fontSize: "0.875rem" }}>
                            Showing {startIndex}-
                            {Math.min(endIndex, transactions.length)} of{" "}
                            {totalItemsForTab} items
                        </div> */}

                        <div
                            style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "center",
                            }}
                        >
                            <button
                                onClick={() =>
                                    setCurrentPage(Math.max(1, currentPage - 1))
                                }
                                disabled={currentPage === 1}
                                style={{
                                    padding: "0.5rem",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(255, 255, 255, 0.2)",
                                    backgroundColor: "transparent",
                                    color:
                                        currentPage === 1 ? "#4b5563" : "#fff",
                                    cursor:
                                        currentPage === 1
                                            ? "not-allowed"
                                            : "pointer",
                                }}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <span style={{ padding: "0 1rem", whiteSpace: "nowrap" }}>
                                Page {currentPage} of {totalPages}
                            </span>

                            <button
                                onClick={() =>
                                    setCurrentPage(
                                        Math.min(totalPages, currentPage + 1)
                                    )
                                }
                                disabled={currentPage === totalPages}
                                style={{
                                    padding: "0.5rem",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(255, 255, 255, 0.2)",
                                    backgroundColor: "transparent",
                                    color:
                                        currentPage === totalPages
                                            ? "#4b5563"
                                            : "#fff",
                                    cursor:
                                        currentPage === totalPages
                                            ? "not-allowed"
                                            : "pointer",
                                }}
                            >
                                <ChevronRight size={16} />
                            </button>

                            <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                style={{
                                    marginLeft: "1rem",
                                    padding: "0.5rem",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(255, 255, 255, 0.2)",
                                    backgroundColor:
                                        "rgba(255, 255, 255, 0.05)",
                                    color: "#fff",
                                }}
                            >
                                <option value="10">10 per page</option>
                                <option value="20">20 per page</option>
                                <option value="50">50 per page</option>
                                <option value="100">100 per page</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransactionTrackerImproved;
