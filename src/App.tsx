import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ApolloClient, ApolloProvider } from "@apollo/client";
import { ToastContainer } from "react-toastify";
import { PendingDeploysStatusProvider } from "./hooks/usePendingDeploysStatus";
import Layout from "./components/Layout";
import LegacyBlockRedirect from "./components/LegacyBlockRedirect";
import RouteFallback from "./components/RouteFallback";
import RouteTitle from "./components/RouteTitle";
import HomePage from "./pages/HomePage";
import FeedbackForm from "./components/community/FeedbackForm";
import "react-toastify/dist/ReactToastify.css";
import "./styles/global.css";

// Home ships with the shell; the heavier routes load on first visit.
const BlockDetailPage = lazy(() => import("./pages/BlockDetailPage"));
const ValidatorsPage = lazy(() => import("./pages/ValidatorsPage"));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));
const IndexerStatusPage = lazy(() => import("./pages/IndexerStatusPage"));
const ValidatorHistoryPage = lazy(() => import("./pages/ValidatorHistoryPage"));
const SearchResultsPage = lazy(() => import("./pages/SearchResultsPage"));
const AddressPage = lazy(() => import("./pages/AddressPage"));
const TransactionDetailPage = lazy(() => import("./pages/TransactionDetailPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const PendingPage = lazy(() => import("./pages/PendingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

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
                <RouteTitle />
                <Layout>
                    <Suspense fallback={<RouteFallback />}>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                            {/* The legacy block list is replaced by the home page. */}
                            <Route path="/blocks" element={<Navigate to="/" replace />} />
                            <Route
                                path="/height/:height"
                                element={<BlockDetailPage />}
                            />
                            <Route
                                path="/block/hash/:blockHash"
                                element={<BlockDetailPage />}
                            />
                            <Route
                                path="/block/:blockNumber"
                                element={<LegacyBlockRedirect />}
                            />
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
                    </Suspense>
                </Layout>
            </Router>
            <FeedbackForm />
            <ToastContainer
                position="bottom-right"
                autoClose={2500}
                newestOnTop
                closeOnClick
                pauseOnFocusLoss={false}
                theme="dark"
            />
        </ExplorerProviders>
    );
}

export default App;
