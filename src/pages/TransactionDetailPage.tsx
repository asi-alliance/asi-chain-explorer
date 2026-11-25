import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import WalletAddressLink from '../components/WalletAddressLink';
import { useQuery } from '@apollo/client';
import { motion } from 'framer-motion';
import { AnimatePresence } from '../components/AnimatePresenceWrapper';
import { 
  ArrowLeft, 
  ExternalLink, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Zap,
  FileText,
  TrendingUp,
  Database,
  Activity,
  Code,
  Share2,
  Download,
  Eye,
} from 'lucide-react';
import { formatLocalTime, formatRelativeTime } from '../utils/time';
import { toast } from 'react-toastify';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { gql } from '@apollo/client';
import { CURRENT_TOKEN } from '../utils/constants';
import { NATIVE_DECIMALS, groupThousands } from '../utils/amounts';
import { deployFee } from '../utils/deployFee';
import CopyButton from '../components/CopyButton';
import NativeTransferLifecycle, {
  lifecycleCallLabel,
  useNativeTransferLifecycle,
} from '../components/NativeTransferLifecycle';
import { getParentHashes } from '../utils/blockParent';
import { getBlockPath } from '../utils/blockPath';
import {
  GET_DEPLOYMENT_INDEXED,
  GET_PENDING_DEPLOY,
  WATCH_DEPLOYMENT_INDEXED,
  WATCH_PENDING_DEPLOY,
} from '../graphql/queries';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { usePendingDeploysStatus } from '../hooks/usePendingDeploysStatus';
import PendingDeployDetails, { PendingDeployLeftBuffer } from '../components/PendingDeployDetails';
import { transferStatusView } from '../utils/transferStatus';
import type { Deployment } from '../types';
import '../styles/transaction.css';

const PENDING_WATCH_MS = 3 * 60_000;

/** Executed fee in ASI, using the block's token decimals when the indexer has them. */
const deploymentFee = (deployment: Deployment) =>
  deployFee(
    deployment.phlo_cost,
    deployment.phlo_price,
    deployment.block?.token_decimals ?? NATIVE_DECIMALS
  );

const GET_TRANSACTION_DETAILS = gql`
  query GetTransactionDetails($deployId: String!) {
    deployments(where: { deploy_id: { _eq: $deployId } }) {
      deploy_id
      deployer
      term
      timestamp
      deployment_type
      phlo_cost
      phlo_price
      phlo_limit
      valid_after_block_number
      status
      block_number
      block_hash
      seq_num
      shard_id
      sig
      sig_algorithm
      errored
      error_message
      created_at
      transfers {
        id
        from_address
        to_address
        amount_asi
        amount_dust
        status
        created_at
      }
      block {
        block_number
        block_hash
        token_decimals
        parent_links {
          parent_hash
          parent_index
        }
        timestamp
        proposer
        deployment_count
        state_hash
        finalization_status
        justifications
        created_at
      }
    }
  }
`;

const TransactionDetailPage: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  return <TransactionDetail key={transactionId} transactionId={transactionId} />;
};

const DETAIL_TABS = ['overview', 'code', 'transfers', 'block'] as const;
type DetailTab = typeof DETAIL_TABS[number];

const detailTabFromParam = (value: string | null): DetailTab => (
  DETAIL_TABS.includes(value as DetailTab) ? value as DetailTab : 'overview'
);

const TransferParty: React.FC<{ label: string; address: string }> = ({ label, address }) => (
  <div>
    <div style={{ color: '#9ca3af', fontSize: '0.75rem', letterSpacing: '0.04em', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div className="mono" style={{ fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-all' }}>
      <WalletAddressLink address={address} />
    </div>
  </div>
);

const TransactionDetail: React.FC<{ transactionId?: string }> = ({ transactionId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DetailTab>(detailTabFromParam(searchParams.get('tab')));
  const [showRawData, setShowRawData] = useState(false);

  useEffect(() => {
    const tab = detailTabFromParam(searchParams.get('tab'));
    setActiveTab(previous => previous === tab ? previous : tab);
  }, [searchParams]);

  const selectTab = (tab: DetailTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };

  const { data, loading, error, refetch } = useQuery(GET_TRANSACTION_DETAILS, {
    variables: { deployId: transactionId },
    skip: !transactionId,
    errorPolicy: 'all'
  });

  const transaction = data?.deployments?.[0];
  const transfers = transaction?.transfers || [];
  const block = transaction?.block;
  // Calls started here show up before the ledger has a transfer, so the tab label counts them too.
  const lifecycle = useNativeTransferLifecycle(transaction?.deploy_id);
  const lifecycleLabel = lifecycleCallLabel(lifecycle);

  // A deploy that is not in a block yet exists only in the pending-deploy
  // snapshot, which the indexer keeps only when it reads validator buffers.
  const notIndexed = !!transactionId && !loading && !error && !transaction;
  const pendingFeature = usePendingDeploysStatus();
  const [watchExpired, setWatchExpired] = useState(false);
  const [detailsChecked, setDetailsChecked] = useState(false);
  const awaitingIndexer = notIndexed && !watchExpired && !detailsChecked;
  const watchPending = awaitingIndexer && !!pendingFeature.status;
  useEffect(() => {
    if (!awaitingIndexer) return;
    const timer = window.setTimeout(() => setWatchExpired(true), PENDING_WATCH_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingIndexer]);

  const { data: pendingData, loading: pendingLoading, error: pendingError } = useLiveQuery(WATCH_PENDING_DEPLOY, GET_PENDING_DEPLOY, {
    variables: { sig: transactionId },
    skip: !watchPending,
  });
  const pendingDeploy = notIndexed ? pendingData?.pending_deploys?.[0] : undefined;
  const isPending = !!pendingDeploy;

  // Remember a pending observation so the page can explain a subsequent empty buffer.
  const [seenInBuffer, setSeenInBuffer] = useState(false);
  useEffect(() => {
    if (isPending) setSeenInBuffer(true);
  }, [isPending]);
  const leftBuffer = watchPending && seenInBuffer && pendingData?.pending_deploys?.length === 0;

  // Reload the details once the indexer stores the deploy, instead of polling them.
  const { data: indexedData, loading: indexedLoading, error: indexedError } = useLiveQuery(WATCH_DEPLOYMENT_INDEXED, GET_DEPLOYMENT_INDEXED, {
    variables: { deployId: transactionId },
    skip: !awaitingIndexer,
  });
  const indexedNow = awaitingIndexer && (indexedData?.deployments?.length ?? 0) > 0;
  const requestedDetails = useRef(false);
  useEffect(() => {
    if (indexedNow && !requestedDetails.current) {
      requestedDetails.current = true;
      // Keep a manual retry available if the detail row is still absent or the request fails.
      void refetch().then(() => setDetailsChecked(true), () => setDetailsChecked(true));
    }
  }, [indexedNow, refetch]);

  useEffect(() => {
    if (!transactionId) {
      navigate('/');
    }
  }, [transactionId, navigate]);

  const shareTransaction = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Transaction link copied to clipboard');
  };

  const downloadTransactionData = (format: 'json' | 'txt') => {
    if (!transaction) return;

    const fee = deploymentFee(transaction);
    const data = {
      transaction,
      transfers,
      block,
      exported_at: new Date().toISOString()
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transaction-${transactionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const text = `
ASI Chain Transaction Details
=============================

Transaction ID: ${transaction.deploy_id}
Deployer: ${transaction.deployer}
Height: ${transaction.block_number}
Timestamp: ${new Date(transaction.timestamp).toLocaleString()}
Status: ${transaction.errored ? 'Failed' : 'Success'}
Phlo Cost: ${transaction.phlo_cost?.toLocaleString() || 'N/A'} phlo
Fee: ${fee ? `${fee.asi} ${CURRENT_TOKEN}` : 'N/A'}
Type: ${transaction.deployment_type || 'Unknown'}

${transaction.error_message ? `Error: ${transaction.error_message}\n` : ''}
${transfers.length > 0 ? `\nTransfers (${transfers.length}):\n${transfers.map((t: any) => 
  `- ${t.amount_asi} ${CURRENT_TOKEN} from ${t.from_address} to ${t.to_address} (${t.status})`
).join('\n')}` : ''}

Exported at: ${new Date().toLocaleString()}
      `.trim();

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transaction-${transactionId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const transferStatusColors = (status: unknown) => transferStatusView(status).completed
    ? { backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }
    : { backgroundColor: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af' };

  const getStatusIcon = (errored: boolean, status?: string) => {
    if (errored) return <XCircle size={20} style={{ color: '#ef4444' }} />;
    if (status === 'success' || status === 'included') return <CheckCircle size={20} style={{ color: '#10b981' }} />;
    if (status === 'pending') return <Clock size={20} style={{ color: '#f59e0b' }} />;
    return <AlertCircle size={20} style={{ color: '#9ca3af' }} />;
  };

  const getStatusText = (errored: boolean, status?: string) => {
    if (errored) return 'Failed';
    if (status === 'success') return 'Success';
    if (status === 'included') return 'Included';
    if (status === 'pending') return 'Pending';
    return 'Unknown';
  };

  const statusError = error ?? (awaitingIndexer
    ? indexedError ?? pendingFeature.error ?? (watchPending ? pendingError : undefined)
    : undefined);
  const checkingStatus = indexedLoading || pendingFeature.loading || (pendingLoading && !pendingData);
  if (loading || (awaitingIndexer && !isPending && (indexedNow || (!statusError && checkingStatus)))) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div className="loading" />
        <p>Loading transaction details...</p>
      </div>
    );
  }

  if (!transaction && (watchExpired || detailsChecked)) {
    return (
      <section className="asi-card">
        {watchExpired && !seenInBuffer && <>
          <h2>Transaction Not Found</h2>
          <p>Transaction {transactionId} could not be found.</p>
        </>}
        {watchExpired && seenInBuffer && <>
          <h2>Deploy status unconfirmed</h2>
          <p>The deploy was seen in a validator buffer earlier. The three-minute watch ended without confirmation that it was included.</p>
        </>}
        {!watchExpired && <h2>Transaction details unavailable</h2>}
        <p role="status">{watchExpired ? 'Automatic updates stopped after three minutes.' :
          'The indexer has recorded this deploy. Its details are currently unavailable.'}</p>
        <button className="btn btn-secondary" onClick={() => {
          setWatchExpired(false);
          void refetch().catch(() => { /* useQuery reports the failure. */ });
        }}>Check again</button>
      </section>
    );
  }

  if (pendingDeploy && !statusError) {
    return <PendingDeployDetails deploy={pendingDeploy} />;
  }

  if (leftBuffer && !statusError && transactionId) {
    return <PendingDeployLeftBuffer sig={transactionId} />;
  }

  // The inclusion watch is still running: this is not a terminal not-found state.
  if (awaitingIndexer && !statusError) {
    return (
      <section className="asi-card">
        <h2>Deploy not indexed yet</h2>
        <p>Transaction {transactionId} has not been indexed in a block yet.</p>
        <p className="text-muted" role="status">
          This page keeps checking for three minutes and updates automatically when the deploy is indexed.
        </p>
      </section>
    );
  }

  if (error || !transaction) {
    return (
      <div className="asi-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ color: '#ef4444', marginBottom: '1rem' }}>
          <AlertCircle size={48} style={{ marginBottom: '1rem' }} />
          <h2>{statusError ? 'Unable to verify deploy status' : 'Transaction Not Found'}</h2>
        </div>
        <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
          {statusError ? statusError.message : `Transaction ${transactionId} could not be found.`}
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
          >
            <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
            Go Back
          </button>
          <button
            onClick={() => { void refetch().catch(() => { /* useQuery reports the failure. */ }); }}
            className="btn btn-primary"
          >
            <Activity size={16} style={{ marginRight: '0.5rem' }} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const feeDecimals = transaction.block?.token_decimals ?? NATIVE_DECIMALS;
  const fee = deploymentFee(transaction);
  const maxFee = deployFee(transaction.phlo_limit, transaction.phlo_price, feeDecimals);
  const statusText = getStatusText(transaction.errored, transaction.status);
  const statusDetail = transaction.errored
    ? transaction.error_message || 'The deploy was processed with an error.'
    : transaction.status === 'pending'
      ? 'The deploy is waiting to be included in a block.'
      : 'The transaction has been processed and included in the blockchain.';
  const statusClass = transaction.errored ? ' is-error' : transaction.status === 'pending' ? ' is-pending' : '';

  const tabs = [
    { key: 'overview', label: 'Overview', icon: <Activity size={16} /> },
    { key: 'code', label: 'Code', icon: <Code size={16} /> },
    { key: 'transfers', label: `Transfers (${transfers.length})${lifecycleLabel ? ` · ${lifecycleLabel}` : ''}`, icon: <TrendingUp size={16} /> },
    { key: 'block', label: 'Block Info', icon: <Database size={16} /> }
  ];

  const renderOverviewTab = () => (
    <div>
      {/* Main Details Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Transaction Info */}
        <div className="asi-card">
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: '#f59e0b'
          }}>
            <FileText size={20} />
            Transaction Information
          </h3>
          <div style={{ gap: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                Deployer
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                wordBreak: 'break-all'
              }}>
                {transaction.deployer}
                <CopyButton dataToCopy={transaction.deployer} iconSize={14} />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                Type
              </div>
              <div style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                borderRadius: '6px',
                color: '#f59e0b',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'inline-block'
              }}>
                {transaction.deployment_type || 'Unknown'}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                Timestamp
              </div>
              <div>
                <div style={{ fontWeight: '500' }}>
                  {formatLocalTime(transaction.timestamp)}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                  {String(transaction.block_number) === '0'
                    ? 'Genesis deployment'
                    : formatRelativeTime(transaction.timestamp)}
                </div>
                {String(transaction.block_number) === '0' && (
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.35rem', lineHeight: 1.45 }}>
                    Imported from RChain mainnet with its original timestamp; the testnet included it in block 0.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Execution Details */}
        <div className="asi-card">
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: '#8b5cf6'
          }}>
            <Zap size={20} />
            Execution Details
          </h3>
          {fee ? (
            <div className="deploy-fee">
              <span className="deploy-fee__label">Transaction fee</span>
              <span className="deploy-fee__value" title={`${fee.asi} ${CURRENT_TOKEN} (${fee.dust} atomic units)`}>
                {fee.display} {CURRENT_TOKEN}
              </span>
              <span className="deploy-fee__note">
                {groupThousands(String(transaction.phlo_cost ?? 0))} phlo ×{" "}
                {groupThousands(String(transaction.phlo_price ?? 0))} atomic units per phlo
                {maxFee ? ` · precharge up to ${maxFee.display} ${CURRENT_TOKEN}` : ""}
              </span>
            </div>
          ) : (
            <p className="deploy-fee__missing" role="status">
              Fee is unavailable: the indexer has not reported both the phlo cost
              and the phlo price for this deploy.
            </p>
          )}
          <div style={{ gap: '1rem' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  Phlo Cost
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#8b5cf6' }}>
                  {transaction.phlo_cost?.toLocaleString() || 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  Phlo Price
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                  {transaction.phlo_price?.toLocaleString() || 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  Phlo Limit
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                  {transaction.phlo_limit?.toLocaleString() || 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  Valid After Block
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                  #{transaction.valid_after_block_number || 'N/A'}
                </div>
              </div>
            </div>

            {transaction.sig && transaction.sig !== transaction.deploy_id && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                  Signature
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                  padding: '0.75rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  {transaction.sig}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Blockchain Info */}
        <div className="asi-card">
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: '#10b981'
          }}>
            <Database size={20} />
            Blockchain Information
          </h3>
          <div style={{ gap: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                Height
              </div>
              <Link
                to={getBlockPath(transaction.block_hash, transaction.block_number)}
                style={{
                  color: '#10b981',
                  textDecoration: 'none',
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                #{transaction.block_number}
                <ExternalLink size={16} />
              </Link>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                Block Hash
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                wordBreak: 'break-all'
              }}>
                {transaction.block_hash}
                <CopyButton dataToCopy={transaction.block_hash} iconSize={14} />
              </div>
            </div>

            {transaction.seq_num !== undefined && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                    Sequence Number
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                    {transaction.seq_num}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                    Shard ID
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                    {transaction.shard_id || 'N/A'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Summary */}
      {transfers.length > 0 && (
        <div className="asi-card">
          <h3 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: '#3b82f6'
          }}>
            <TrendingUp size={20} />
            Transfer Summary ({transfers.length})
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem'
          }}>
            {transfers.slice(0, 4).map((transfer: any) => (
              <div
                key={transfer.id}
                style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontWeight: '600', color: '#3b82f6' }}>
                    {transfer.amount_asi} {CURRENT_TOKEN}
                  </span>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    ...transferStatusColors(transfer.status),
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    {transferStatusView(transfer.status).label}
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <TransferParty label="From" address={transfer.from_address} />
                  <TransferParty label="To" address={transfer.to_address} />
                </div>
              </div>
            ))}
          </div>
          {transfers.length > 4 && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                onClick={() => selectTab('transfers')}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: '#3b82f6',
                  cursor: 'pointer'
                }}
              >
                View All {transfers.length} Transfers
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCodeTab = () => (
    <div className="asi-card">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h3 style={{ margin: 0 }}>
          Contract Code
          <CopyButton dataToCopy={transaction.term} iconSize={14} />
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowRawData(!showRawData)}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              backgroundColor: showRawData ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: '#9ca3af',
              cursor: 'pointer'
            }}
          >
            {showRawData ? 'Hide Raw' : 'Show Raw'}
          </button>
        </div>
      </div>

      <div style={{
        maxHeight: '600px',
        overflow: 'auto',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <SyntaxHighlighter
          language={showRawData ? "text" : "scala"}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            fontSize: '0.875rem',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
          }}
        >
          {transaction.term || '// No code available'}
        </SyntaxHighlighter>
      </div>

      {transaction.term && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          fontSize: '0.875rem',
          color: '#9ca3af'
        }}>
          <strong>Code Analysis:</strong>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            <li>Language: Rholang</li>
            <li>Size: {new Blob([transaction.term]).size} bytes</li>
            <li>Lines: {transaction.term.split('\n').length}</li>
          </ul>
        </div>
      )}
    </div>
  );

  const renderTransfersTab = () => (
    <div className="asi-card">
      <h3 style={{ marginBottom: '1rem' }}>Transfers ({transfers.length})</h3>
      
      {transfers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#6b7280'
        }}>
          <TrendingUp size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>No transfers found for this transaction</p>
        </div>
      ) : (
        <div style={{ gap: '1rem' }}>
          {transfers.map((transfer: any, index: number) => (
            <motion.div
              key={transfer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              style={{
                padding: '1.5rem',
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                marginBottom: '1rem'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#3b82f6',
                    marginBottom: '0.25rem'
                  }}>
                    {transfer.amount_asi} {CURRENT_TOKEN}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                    Transfer #{transfer.id}
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  ...transferStatusColors(transfer.status),
                  fontWeight: '500'
                }}>
                  {transferStatusView(transfer.status).completed ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {transferStatusView(transfer.status).label}
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '1rem',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                    From
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    wordBreak: 'break-all'
                  }}>
                    <WalletAddressLink address={transfer.from_address} />
                  </div>
                </div>

                <div style={{
                  padding: '0.5rem',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#3b82f6'
                }}>
                  <TrendingUp size={16} />
                </div>

                <div>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                    To
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    wordBreak: 'break-all'
                  }}>
                    <WalletAddressLink address={transfer.to_address} />
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.875rem',
                color: '#9ca3af'
              }}>
                <div>
                  <Clock size={14} style={{ marginRight: '0.25rem' }} />
                  {formatRelativeTime(transfer.created_at)}
                </div>
                {transfer.amount_dust && (
                  <div>
                    Dust: {transfer.amount_dust}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  const renderBlockTab = () => (
    <div className="asi-card">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ margin: 0 }}>Block Information</h3>
        <Link
          to={getBlockPath(transaction.block_hash, transaction.block_number)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #10b981',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: '#10b981',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Eye size={14} />
          View Full Block
        </Link>
      </div>

      {block ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem'
        }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
              Height
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#10b981' }}>
              #{block.block_number}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
              Timestamp
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '500' }}>
              {formatLocalTime(block.timestamp)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
              Proposer
            </div>
            <div style={{
              fontSize: '0.875rem',
              wordBreak: 'break-all'
            }}>
              {block.proposer}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
              Total Deployments
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
              {block.deployment_count}
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
              Block Hash
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              wordBreak: 'break-all',
              padding: '0.75rem',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '6px'
            }}>
              {block.block_hash}
              <CopyButton dataToCopy={block.block_hash} iconSize={14} />
            </div>
          </div>

          {getParentHashes(block).length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Parent Hash{getParentHashes(block).length > 1 ? 'es' : ''}
              </div>
              {getParentHashes(block).map((parentHash) => (
                <div
                  key={parentHash}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    wordBreak: 'break-all',
                    padding: '0.75rem',
                    marginBottom: '0.25rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px'
                  }}
                >
                  {parentHash}
                  <CopyButton dataToCopy={parentHash} iconSize={14} />
                </div>
              ))}
            </div>
          )}

          {block.state_hash && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                State Hash
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                wordBreak: 'break-all',
                padding: '0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px'
              }}>
                {block.state_hash}
                <CopyButton dataToCopy={block.state_hash} iconSize={14} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
          Block information not available
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <div style={{ flex: 1 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          
          <div className="transaction-heading">
            <h1>Transaction Details</h1>
            <span
              className={`transaction-status${statusClass}`}
              role="img"
              title={`Transaction ${statusText}: ${statusDetail}`}
              aria-label={`Transaction ${statusText}: ${statusDetail}`}
              tabIndex={0}
            >
              <span aria-hidden="true">{getStatusIcon(transaction.errored, transaction.status)}</span>
            </span>
          </div>
          <div className="transaction-id-row">
            <span className="mono">{transaction.deploy_id}</span>
            <CopyButton dataToCopy={transaction.deploy_id} iconSize={14} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          <CopyButton action={shareTransaction} icon={<Share2 size={16} />} className='share-button' />

          <button
            onClick={() => downloadTransactionData('json')}
            style={{
              padding: '0.5rem',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer'
            }}
            title="Download as JSON"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '2rem',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        padding: '0.5rem'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key as DetailTab)}
            aria-pressed={activeTab === tab.key}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: activeTab === tab.key ? '#10b981' : 'transparent',
              color: activeTab === tab.key ? '#000' : '#9ca3af',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontWeight: '500'
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'code' && renderCodeTab()}
          {activeTab === 'transfers' && (
            <>
              {renderTransfersTab()}
              <NativeTransferLifecycle lifecycle={lifecycle} />
            </>
          )}
          {activeTab === 'block' && renderBlockTab()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TransactionDetailPage;
