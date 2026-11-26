import React, {
    useState,
    useEffect,
    useMemo,
    useRef,
} from "react";
import { useQuery, gql, useLazyQuery } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  ArrowRightLeft,
  Activity,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatLocalTime, formatRelativeTime, toMillis } from '../utils/time';
import { CURRENT_TOKEN } from '../utils/constants';
import RecentDataExporter, { ExportEntities } from "./RecentDataExporter";
import SearchField from "./SearchField";

// GraphQL Queries
const GET_TRANSACTION_COUNTS = gql`
    query GetTransactionCounts {
        deployments_aggregate {
            aggregate {
                count
            }
        }
        contract_deployments: deployments_aggregate(
            where: { _not: { transfers: {} } }
        ) {
            aggregate {
                count
            }
        }
        transfer_deployments: deployments_aggregate(where: { transfers: {} }) {
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
            transfers {
                id
            }
        }
    }
`;

const GET_PAGINATED_TRANSACTIONS = gql`
    query GetPaginatedTransactions(
        $deploymentLimit: Int!
        $deploymentOffset: Int!
        $deploymentWhere: deployments_bool_exp!
        $transferLimit: Int!
        $transferOffset: Int!
    ) {
        deployments(
            limit: $deploymentLimit
            offset: $deploymentOffset
            where: $deploymentWhere
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

type TransactionTab = "all" | "contract" | "transfers";

const tabFromParam = (value: string | null): TransactionTab => {
    if (value === "transfers") return "transfers";
    if (value === "contract") return "contract";
    // Older links used ?tab=deployments for the full deploy list.
    return "all";
};

const TransactionTrackerImproved: React.FC<TransactionTrackerImprovedProps> = ({
    onTransactionSelect,
    embedded = false,
}) => {
    const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const [searchParams, setSearchParams] = useSearchParams();
    // State
    const [activeTab, setActiveTab] = useState<TransactionTab>(tabFromParam(searchParams.get("tab")));
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const tab = tabFromParam(searchParams.get("tab"));
        setActiveTab(previous => previous === tab ? previous : tab);
        setCurrentPage(1);
    }, [searchParams]);

    const selectTab = (tab: TransactionTab) => {
        setActiveTab(tab);
        setCurrentPage(1);
        const next = new URLSearchParams(searchParams);
        if (tab === "all") next.delete("tab");
        else next.set("tab", tab);
        setSearchParams(next);
    };

    // Fetch total counts
    const { data: countsData } = useQuery(GET_TRANSACTION_COUNTS, {
        pollInterval: 30000, // Update counts every 30 seconds
    });
    
    const [
        searchTransactions,
        { data: transactionsSearchData, loading: areTransactionsSearching },
    ] = useLazyQuery(SEARCH_TRANSACTIONS);

    const totalDeployments = countsData?.deployments_aggregate?.aggregate?.count || 0;
    const contractDeployments = countsData?.contract_deployments?.aggregate?.count || 0;
    const transferDeployments = countsData?.transfer_deployments?.aggregate?.count || 0;
    const totalTransfers = countsData?.transfers_aggregate?.aggregate?.count || 0;

    const allSearchDeployments = useMemo(
        () => transactionsSearchData?.deployments ?? [],
        [transactionsSearchData]
    );
    const searchDeployments = useMemo(
        () => activeTab === "contract"
            ? allSearchDeployments.filter((deployment: any) => !deployment.transfers?.length)
            : allSearchDeployments,
        [allSearchDeployments, activeTab]
    );

    const totalSearchDeployments = searchQuery ? searchDeployments.length : totalDeployments;
    const totalSearchContract = searchQuery
        ? allSearchDeployments.filter((deployment: any) => !deployment.transfers?.length).length
        : contractDeployments;
    const totalSearchTransfers = searchQuery
        ? transactionsSearchData?.transfers?.length || 0
        : totalTransfers;

    // Calculate pagination
    const deploymentWhere =
        activeTab === "contract" ? { _not: { transfers: {} } } : {};
    const deploymentOffset =
        activeTab === "transfers" ? 0 : (currentPage - 1) * itemsPerPage;
    const transferOffset =
        activeTab === "all" || activeTab === "contract" ? 0 : (currentPage - 1) * itemsPerPage;
    const deploymentLimit = activeTab === "transfers" ? 0 : itemsPerPage;
    const transferLimit = activeTab === "transfers" ? itemsPerPage : 0;


    const {
        data: transactionData,
        loading,
    } = useQuery(GET_PAGINATED_TRANSACTIONS, {
        variables: {
            deploymentLimit,
            deploymentOffset,
            deploymentWhere,
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

    const searchResults = useMemo(() => {

      const results: any[] = [];

      if (activeTab !== "transfers") {
            searchDeployments.forEach((deployment: any) => {
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
            const timeA = toMillis(a.displayTime);
            const timeB = toMillis(b.displayTime);
            return timeB - timeA;
      });
    }, [transactionsSearchData, activeTab, searchDeployments])

    const transactions = useMemo(() => {

        if (searchQuery) {
          return searchResults;
        }

        if (!transactionData){
          return []
        }

        const results: any[] = [];

        // if (activeTab === 'all' || activeTab === 'deployments') {
        if (activeTab !== "transfers") {
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
            const timeA = toMillis(a.displayTime);
            const timeB = toMillis(b.displayTime);
            return timeB - timeA;
        });
    }, [searchQuery, searchResults, transactionData, activeTab]);

    // Calculate pagination info
    const totalItemsForTab =
        activeTab === "contract"
            ? contractDeployments
            : activeTab === "transfers"
            ? totalTransfers
            : totalDeployments;

    const totalPages = Math.ceil(totalItemsForTab / itemsPerPage);
    // const startIndex = (currentPage - 1) * itemsPerPage + 1;
    // const endIndex = Math.min(currentPage * itemsPerPage, totalItemsForTab);

    // Get heading text based on context
    const getHeading = () => {
        if (activeTab === "contract") {
            return {
                title: "Contract deploys",
                subtitle: "Deploys without transfer events",
                exportEntity: ExportEntities.DEPLOYMENTS
            };
        }
        if (activeTab === "transfers") {
            return {
                title: "Transfers",
                subtitle: "Transfer events emitted by deploys",
                exportEntity: ExportEntities.TRANSFERS
            };
        }
        return {
            title: "All deploys",
            subtitle: "Every deploy, including those that move tokens",
            exportEntity: ExportEntities.DEPLOYMENTS
        };
    };

    const heading = getHeading();

    const deployPartition =
        contractDeployments + transferDeployments === totalDeployments;
    const deploySummary = deployPartition
        ? `${totalDeployments} deploys: ${contractDeployments} contract + ${transferDeployments} with transfers`
        : `${totalDeployments} deploys · ${transferDeployments} with transfers`;

    const tabs = [
        {
            tab: "all" as const,
            label: "All deploys",
            count: searchQuery ? totalSearchDeployments : totalDeployments,
            icon: <Layers size={15} aria-hidden="true" />,
        },
        {
            tab: "contract" as const,
            label: "Contract deploys",
            count: searchQuery ? totalSearchContract : contractDeployments,
            icon: <FileText size={15} aria-hidden="true" />,
        },
        {
            tab: "transfers" as const,
            label: "Transfers",
            count: searchQuery ? totalSearchTransfers : totalTransfers,
            icon: <ArrowRightLeft size={15} aria-hidden="true" />,
        },
    ];

    return (
        <div className={embedded ? "" : "asi-card"}>
            {/* Header */}
            <div style={{ marginBottom: "2rem" }}>
                <div className="section-header transactions-tracker">
                    <div className="header-content-wrapper">
                        <h1 style={{ margin: "0 0 0.5rem 0" }}>{heading.title}</h1>
                    </div>
                </div>
                <p
                    style={{
                        margin: 0,
                        color: "#9ca3af",
                    }}
                >
                    {heading.subtitle}
                </p>
            </div>

            {/* Tab Navigation */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    marginBottom: "2rem",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ display: "flex", gap: "0.35rem" }}>
                    {tabs.map(({ tab, label, count, icon }) => (
                        <button
                            className="text-1"
                            key={tab}
                            onClick={() => selectTab(tab)}
                            aria-pressed={activeTab === tab}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
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
                            {icon}
                            {`${label} (${count})`}
                        </button>
                    ))}
                </div>
                {!searchQuery && (
                    <span
                        style={{
                            marginLeft: "auto",
                            paddingBottom: "0.75rem",
                            color: "#9ca3af",
                            fontSize: "0.875rem",
                        }}
                    >
                        {deploySummary}
                    </span>
                )}
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: "2rem" }}>
                <SearchField
                    placeholder="Search by ID, address, or block hash..."
                    aria-label="Search transactions by ID, address, or block hash"
                    value={searchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                />
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
                                        <span title={formatLocalTime(tx.displayTime)}>
                                            {String(tx.block_number) === "0"
                                                ? "Genesis"
                                                : formatRelativeTime(tx.displayTime)}
                                        </span>
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
            {!loading && !areTransactionsSearching && transactions.length > 0 && (
                <div className="table-footer">
                    <span className="text-muted">
                        {searchQuery
                            ? `${transactions.length} matching ${activeTab === "contract" ? "contract deploys" : activeTab === "transfers" ? "transfers" : "deploys"}`
                            : `Showing ${(currentPage - 1) * itemsPerPage + 1}-${(currentPage - 1) * itemsPerPage + transactions.length} of ${totalItemsForTab}`}
                    </span>
                    <RecentDataExporter entityToExport={heading.exportEntity} />
                </div>
            )}
        </div>
    );
};

export default TransactionTrackerImproved;
