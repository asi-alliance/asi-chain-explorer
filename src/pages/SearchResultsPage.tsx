import React from 'react';
import { useQuery } from '@apollo/client';
import { formatLocalTime, formatRelativeTime } from '../utils/time';
import { Clock } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GET_PENDING_DEPLOY } from '../graphql/queries';
import { addressPath, isVaultAddress } from '../utils/addressPath';
import { heightInput } from '../utils/blockHeight';
import { SEARCH_PAGE_SIZE as PAGE_SIZE, SearchType } from '../utils/search';
import { useSearchResults } from '../hooks/useSearchResults';
import { useRecentSearches } from '../hooks/useRecentSearches';
import CopyButton from '../components/CopyButton';
import ShareLinkButton from '../components/ShareLinkButton';
import SearchField from '../components/SearchField';
import '../styles/search-results.css';

function looksLikeDeploySignature(value: string): boolean {
  return value.length >= 64 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

const TYPE_LABELS: Record<string, string> = {
  block: 'Block',
  transfer: 'Transfer',
  deployment: 'Transaction',
};

const SEARCH_TYPES: Array<{ value: SearchType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'deployments', label: 'Transactions' },
  { value: 'transfers', label: 'Transfers' },
];

function shortHash(hash: string): string {
  return hash.length <= 18 ? hash : `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function relativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return formatRelativeTime(timestamp);
}

const SearchResultsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { add: addRecentSearch } = useRecentSearches();
  const query = (params.get('q') || '').trim();
  const type = (['blocks', 'transfers', 'deployments'].includes(params.get('type') || '')
    ? params.get('type') : 'all') as SearchType;
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const amountParam = (key: string) => {
    const value = (params.get(key) || '').trim();
    return /^\d+(?:\.\d+)?$/.test(value) ? value : '';
  };
  const minAmount = amountParam('min');
  const maxAmount = amountParam('max');
  const hasAmountFilter = type === 'transfers' && (!!minAmount || !!maxAmount);
  const hasQuery = !!query || hasAmountFilter;
  const { rows, hasMore, loading, error } = useSearchResults(query, page, order, type, { minAmount, maxAmount });
  const height = heightInput(query);
  const pendingResult = useQuery<{ pending_deploys: Array<{
    sig: string;
    is_rejected: boolean;
    timestamp: string | number;
    included_deployment?: { deploy_id: string } | null;
  }> }>(GET_PENDING_DEPLOY, {
    variables: { sig: query },
    skip: !looksLikeDeploySignature(query),
    fetchPolicy: 'no-cache',
    errorPolicy: 'ignore',
  });
  const pending = pendingResult.data?.pending_deploys?.[0];
  const pendingIndexed = pending
    ? pending.included_deployment != null || rows.some((row) => row.data?.deploy_id === pending.sig)
    : false;
  const firstResult = (page - 1) * PAGE_SIZE + 1;
  const resultSummary = rows.length === 1
    ? page === 1 ? 'Showing 1 result' : `Showing result ${firstResult}`
    : `Showing ${firstResult}–${firstResult + rows.length - 1} results`;
  const blockHeightCounts = new Map<string, number>();
  rows.forEach((row) => {
    if (row.type === 'block') {
      blockHeightCounts.set(row.title, (blockHeightCounts.get(row.title) || 0) + 1);
    }
  });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const updateAmounts = (min: string, max: string) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of [['min', min], ['max', max]] as const) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setParams(next);
  };
  return <section className="asi-card search-results">
    <header className="search-results__head">
      <h1>Search results</h1>
      <p className="search-results__subtitle">
        Find a block, transaction, transfer, or wallet address by its identifier.
      </p>
    </header>

    <form className="search-results__form" onSubmit={event => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get('query')?.toString().trim() || '';
      addRecentSearch(value);
      if (type === 'all' && isVaultAddress(value)) navigate(addressPath(value));
      else update('q', value);
    }}>
      <label className="search-results__sr-only" htmlFor="search-query">
        Block height or hash, transaction ID, or address
      </label>
      <SearchField
        id="search-query"
        name="query"
        key={query}
        defaultValue={query}
        placeholder="Block height or hash, transaction ID, or address"
        aria-label="Block height or hash, transaction ID, or address"
      />
      <button type="submit" className="btn btn-primary search-results__submit">Search</button>
    </form>

    {isVaultAddress(query) && (
      <Link className="search-results__wallet" to={addressPath(query)}>
        View wallet address
        <span aria-hidden="true">→</span>
      </Link>
    )}
    {height !== null && (
      <Link className="search-results__height" to={`/height/${height}`}>
        View all blocks at height #{height}
        <span aria-hidden="true">→</span>
      </Link>
    )}
    {pending && !pendingIndexed && (
      <Link
        className="search-results__pending"
        to={`/transaction/${encodeURIComponent(pending.sig)}`}
      >
        <Clock size={16} aria-hidden="true" />
        <span>
          <strong>Pending deploy</strong>
          <small>
            {pending.is_rejected
              ? 'Rejected; retrying in the validator buffer'
              : 'Waiting in the validator buffer'}
          </small>
        </span>
        <span aria-hidden="true">View →</span>
      </Link>
    )}

    <div className="search-results__tabs" role="tablist" aria-label="Result type">
      {SEARCH_TYPES.map((item, index) => (
        <button
          key={item.value}
          id={`search-type-${item.value}`}
          type="button"
          role="tab"
          aria-selected={type === item.value}
          tabIndex={type === item.value ? 0 : -1}
          className={`search-results__tab${type === item.value ? ' is-active' : ''}`}
          onClick={() => update('type', item.value)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0
              : event.key === 'End' ? SEARCH_TYPES.length - 1
                : event.key === 'ArrowRight' ? (index + 1) % SEARCH_TYPES.length
                  : (index - 1 + SEARCH_TYPES.length) % SEARCH_TYPES.length;
            update('type', SEARCH_TYPES[next].value);
            requestAnimationFrame(() => {
              document.getElementById(`search-type-${SEARCH_TYPES[next].value}`)?.focus();
            });
          }}
        >
          {item.label}
        </button>
      ))}
    </div>

    {type === 'transfers' && (
      <form
        className="search-results__amounts"
        key={`${minAmount}:${maxAmount}`}
        onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          updateAmounts(String(data.get('min') ?? '').trim(), String(data.get('max') ?? '').trim());
        }}
      >
        <span className="search-results__amounts-label">Amount range (ASI)</span>
        <input name="min" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]+)?"
          placeholder="Min" defaultValue={minAmount} aria-label="Minimum ASI amount" />
        <span aria-hidden="true">to</span>
        <input name="max" type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]+)?"
          placeholder="Max" defaultValue={maxAmount} aria-label="Maximum ASI amount" />
        <button type="submit" className="btn btn-secondary">Apply</button>
        {(minAmount || maxAmount) && (
          <button type="button" className="search-results__amounts-clear" onClick={() => updateAmounts('', '')}>
            Clear
          </button>
        )}
      </form>
    )}

    <div className="search-results__toolbar">
      <label className="search-results__select">Order
        <select aria-label="Result order" value={order} onChange={e => update('order', e.target.value)}>
          <option value="desc">Newest first</option><option value="asc">Oldest first</option>
        </select>
      </label>
      <div className="search-results__share">
        <ShareLinkButton label="Copy search link" />
      </div>
    </div>

    {!hasQuery ? <p className="search-results__empty">Enter a query or an ASI amount range to search the indexed chain.</p>
      : loading ? <p className="search-results__empty" role="status">Searching…</p>
        : error ? <p className="search-results__error" role="alert">Search failed: {error.message}</p> : <>
          <p className="search-results__summary">
            {rows.length ? resultSummary : 'No results'} {query ? `for “${query}”` : 'for the selected amount range'}
          </p>
          {rows.length === 0 ? <p className="search-results__empty">
            Try a block height or hash, a transaction ID, or a wallet address.
          </p> : (
            <ol className="search-results__list">
              {rows.map(row => {
                const label = TYPE_LABELS[row.type] || row.type;
                const iso = Number.isFinite(row.timestamp) && row.timestamp > 0
                  ? new Date(row.timestamp).toISOString() : undefined;
                const duplicateHeight = row.type === 'block' && (blockHeightCounts.get(row.title) || 0) > 1;
                const displayTitle = duplicateHeight && row.data?.block_hash
                  ? `${row.title} · ${shortHash(String(row.data.block_hash))}`
                  : row.title;
                return <li key={row.id} className="search-results__row">
                  <span className={`search-results__badge search-results__badge--${row.type}`}>{label}</span>
                  <div className="search-results__body">
                    <div className="search-results__title-row">
                      <Link className="search-results__title" to={row.path}
                        title={row.data?.deploy_id || row.data?.block_hash || row.title}>
                        {displayTitle}
                      </Link>
                      <CopyButton
                        dataToCopy={String(row.data?.deploy_id || row.data?.block_hash || row.title)}
                        label={`Copy ${label.toLowerCase()}`}
                        iconSize={13}
                      />
                    </div>
                    <p className="search-results__description">{row.description}</p>
                    <small className="search-results__meta">
                      {iso
                        ? <time dateTime={iso} title={formatLocalTime(row.timestamp)}>
                            {String(row.data?.block_number) === '0' ? 'Genesis' : relativeTime(row.timestamp)}
                          </time>
                        : <span>Time unavailable</span>}
                      <span aria-hidden="true">·</span>
                      <span>{label}</span>
                    </small>
                  </div>
                </li>;
              })}
            </ol>
          )}
          <nav className="search-results__pagination" aria-label="Search result pages">
            <button type="button" className="search-results__page-button" disabled={page === 1}
              onClick={() => update('page', String(page - 1))}>Previous</button>
            <span>Page {page}</span>
            <button type="button" className="search-results__page-button" disabled={!hasMore}
              onClick={() => update('page', String(page + 1))}>Next</button>
          </nav>
        </>}
  </section>;
};
export default SearchResultsPage;
