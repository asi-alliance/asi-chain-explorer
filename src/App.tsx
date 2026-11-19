import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ApolloClient, ApolloProvider } from "@apollo/client";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import BlocksPage from "./pages/BlocksPage";
import BlockDetailPage from "./pages/BlockDetailPage";
// import TransfersPage from "./pages/TransfersPage";
import ValidatorsPage from "./pages/ValidatorsPage";
// import DeploymentsPage from "./pages/DeploymentsPage";
import StatisticsPage from "./pages/StatisticsPage";
import IndexerStatusPage from "./pages/IndexerStatusPage";
import ValidatorHistoryPage from "./pages/ValidatorHistoryPage";
import SearchResultsPage from "./pages/SearchResultsPage";
import TransactionDetailPage from "./pages/TransactionDetailPage";
import TransactionsPage from "./pages/TransactionsPage";
import PendingPage from "./pages/PendingPage";
import FeedbackForm from "./components/community/FeedbackForm";

import "./styles/global.css";
function App({ client }: { client: ApolloClient<unknown> }) {
    return (
        <ApolloProvider client={client}>
            <Router>
                <Layout>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/blocks" element={<BlocksPage />} />
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
                        <Route
                            path="/transactions"
                            element={<TransactionsPage />}
                        />
                        <Route path="/pending" element={<PendingPage />} />
                        <Route
                            path="/transaction/:transactionId"
                            element={<TransactionDetailPage />}
                        />
                    </Routes>
                </Layout>
            </Router>
            <FeedbackForm />
        </ApolloProvider>
    );
}

export default App;
