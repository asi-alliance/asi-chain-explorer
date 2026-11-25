import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ApolloClient, ApolloProvider } from "@apollo/client";
import { PendingDeploysStatusProvider } from "./hooks/usePendingDeploysStatus";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import BlockDetailPage from "./pages/BlockDetailPage";
// import TransfersPage from "./pages/TransfersPage";
import ValidatorsPage from "./pages/ValidatorsPage";
// import DeploymentsPage from "./pages/DeploymentsPage";
import StatisticsPage from "./pages/StatisticsPage";
import IndexerStatusPage from "./pages/IndexerStatusPage";
import ValidatorHistoryPage from "./pages/ValidatorHistoryPage";
import SearchResultsPage from "./pages/SearchResultsPage";
import AddressPage from "./pages/AddressPage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import TransactionsPage from "./pages/TransactionsPage";
import PendingPage from "./pages/PendingPage";
import NotFoundPage from "./pages/NotFoundPage";
import FeedbackForm from "./components/community/FeedbackForm";

import "./styles/global.css";
function ExplorerProviders({ client, children }: React.PropsWithChildren<{ client: ApolloClient<unknown> }>) {
    return (
        <ApolloProvider client={client}>
            <PendingDeploysStatusProvider>{children}</PendingDeploysStatusProvider>
        </ApolloProvider>
    );
}

function App({ client }: { client: ApolloClient<unknown> }) {
    return (
        <ExplorerProviders client={client}>
            <Router>
                <Layout>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        {/* The legacy block list is replaced by the home page. */}
                        <Route path="/blocks" element={<Navigate to="/" replace />} />
                        <Route
                            path="/block/:blockNumber"
                            element={<BlockDetailPage />}
                        />
                        <Route
                            path="/block/hash/:blockHash"
                            element={<BlockDetailPage />}
                        />
                        {/* <Route
                                path="/transfers"
                                element={<TransfersPage />}
                            /> */}
                        {/* <Route
                                path="/deployments"
                                element={<DeploymentsPage />}
                            /> */}
                        <Route
                            path="/validators"
                            element={<ValidatorsPage />}
                        />
                        <Route
                            path="/validator-history"
                            element={<ValidatorHistoryPage />}
                        />
                        <Route
                            path="/statistics"
                            element={<StatisticsPage />}
                        />
                        <Route
                            path="/indexer-status"
                            element={<IndexerStatusPage />}
                        />
                        <Route path="/search" element={<SearchResultsPage />} />
                        <Route path="/address/:address" element={<AddressPage />} />
                        <Route
                            path="/transactions"
                            element={<TransactionsPage />}
                        />
                        <Route path="/pending" element={<PendingPage />} />
                        <Route
                            path="/transaction/:transactionId"
                            element={<TransactionDetailPage />}
                        />
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Layout>
            </Router>
            <FeedbackForm />
        </ExplorerProviders>
    );
}

export default App;
