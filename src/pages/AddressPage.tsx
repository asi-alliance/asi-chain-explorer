import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, Wallet } from 'lucide-react';
import { getPublicConfig } from '../runtimeConfig';
import { formatRaw, groupThousands, validateDecimals } from '../utils/amounts';
import { isVaultAddress } from '../utils/addressPath';
import { getBlockPath } from '../utils/blockPath';
import { CURRENT_TOKEN } from '../utils/constants';
import AddressPendingDeploys from '../components/AddressPendingDeploys';
import AddressTransferHistory, { Direction } from '../components/AddressTransferHistory';
import CopyButton from '../components/CopyButton';
import '../styles/address.css';

interface BalanceSnapshot {
  amount: string;
  hash: string;
  height: number;
}

interface BalanceState {
  balance?: BalanceSnapshot;
  error: string;
  loading: boolean;
  refreshing: boolean;
  updatedAt?: Date;
}

const INITIAL_BALANCE_STATE: BalanceState = { error: '', loading: true, refreshing: false };

/**
 * Reads the finalized spendable balance. A refresh keeps the previous snapshot
 * visible while the next one loads, and supersedes any read still in flight.
 */
function useAddressBalance(address: string, revision: number): BalanceState {
  const [state, setState] = useState<BalanceState>(INITIAL_BALANCE_STATE);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    setState(previous => ({
      ...previous,
      error: '',
      loading: previous.balance === undefined,
      refreshing: previous.balance !== undefined,
    }));

    async function load(canRetry: boolean) {
      timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const base = getPublicConfig().indexerApiUrl.replace(/\/+$/, '');
        const response = await fetch(`${base}/address/${encodeURIComponent(address)}`,
          { signal: controller.signal, cache: 'no-store' });
        if (!active) return;
        if (canRetry && response.status === 503) {
          const delay = response.headers?.get('Retry-After');
          if (delay && /^\d+$/.test(delay) && Number(delay) < 30) {
            retryTimer = setTimeout(() => { void load(false); }, Number(delay) * 1000);
            return;
          }
        }
        if (response.status === 400) {
          setState(previous => ({ ...previous, error: 'Invalid ASI address.', loading: false, refreshing: false }));
          return;
        }
        if (!response.ok) throw new Error('Balance lookup failed');
        const row = await response.json();
        if (row.address !== address || typeof row.balance !== 'string' ||
            typeof row.block_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(row.block_hash) ||
            !Number.isSafeInteger(row.block_number) || row.block_number < 0) {
          throw new Error('Malformed balance response');
        }
        const amount = formatRaw(row.balance, validateDecimals(row.token_decimals));
        if (!active) return;
        setState({
          balance: { amount, hash: row.block_hash, height: row.block_number },
          error: '',
          loading: false,
          refreshing: false,
          updatedAt: new Date(),
        });
      } catch {
        if (active) {
          setState(previous => ({ ...previous, error: 'Balance unavailable.', loading: false, refreshing: false }));
        }
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }

    void load(true);
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (timeout) clearTimeout(timeout);
      controller.abort();
    };
  }, [address, revision]);

  return state;
}

function AddressView({ address }: { address: string }) {
  const [direction, setDirection] = useState<Direction>('all');
  const [revision, setRevision] = useState(0);
  const { balance, error, loading, refreshing, updatedAt } = useAddressBalance(address, revision);
  const busy = loading || refreshing;

  return (
    <div className="address-page">
      <nav className="address-breadcrumb" aria-label="Breadcrumb">
        <Link to="/"><ArrowLeft size={14} aria-hidden="true" /> Explorer</Link>
        <span aria-hidden="true">/</span>
        <span className="address-breadcrumb__current" aria-current="page">Wallet address</span>
      </nav>

      <header className="asi-card address-hero">
        <div className="address-hero__main">
          <span className="address-hero__icon"><Wallet size={24} aria-hidden="true" /></span>
          <div className="address-hero__text">
            <h1>Wallet address</h1>
            <p className="address-hero__subtitle">Finalized balance and indexed transfer history on ASI Chain.</p>
            <div className="address-chip">
              <code>{address}</code>
              <CopyButton dataToCopy={address} label="Copy wallet address" className="address-copy" />
            </div>
          </div>
        </div>
        <div className="address-hero__actions">
          <button type="button" className="btn btn-secondary address-refresh"
            onClick={() => setRevision(value => value + 1)} aria-busy={busy}>
            <RefreshCw size={16} className={busy ? 'spin' : undefined} aria-hidden="true" />
            Refresh
          </button>
          <span className="address-updated" aria-live="polite">
            {updatedAt ? `Balance updated ${format(updatedAt, 'HH:mm:ss')}` : loading ? 'Loading balance…' : 'Not updated'}
          </span>
        </div>
      </header>

      <section className="asi-card address-balance" aria-labelledby="balance-heading" aria-busy={busy}>
        <div>
          <h2 id="balance-heading" className="address-label">Spendable balance</h2>
          {error && (
            <div className="address-alert" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {balance ? (
            <div className="address-balance__value">
              {groupThousands(balance.amount)} {CURRENT_TOKEN}
            </div>
          ) : loading ? (
            <>
              <span className="address-skeleton" aria-hidden="true" />
              <p className="address-loading" role="status">
                <span className="loading" aria-hidden="true" /> Loading balance…
              </p>
            </>
          ) : null}
          {balance && (
            <p className="address-foot">
              {error ? 'Last loaded at' : 'Finalized in'} block{' '}
              <Link to={getBlockPath(balance.hash)}>#{balance.height}</Link>
            </p>
          )}
        </div>
        <div className="address-balance__side">
          <p className="address-label">Source</p>
          <p className="address-source">
            <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
            Indexer finalized state
          </p>
          <p className="address-note">
            Only finalized transfers are included in this balance. Pending or unfinalized transfers are not counted.
          </p>
        </div>
      </section>

      <AddressPendingDeploys address={address} />

      <AddressTransferHistory key={revision} address={address} balanceHeight={balance?.height}
        direction={direction} onDirectionChange={setDirection} />
    </div>
  );
}

export default function AddressPage() {
  const { address = '' } = useParams();
  if (!isVaultAddress(address)) {
    return (
      <section className="asi-card address-invalid">
        <AlertTriangle size={40} aria-hidden="true" />
        <h1>Wallet address</h1>
        <p role="alert">Invalid ASI address.</p>
        <Link to="/" className="btn btn-secondary">Back to blocks</Link>
      </section>
    );
  }
  return <AddressView key={address} address={address} />;
}
