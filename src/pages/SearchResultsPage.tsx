import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Search } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addressPath, isVaultAddress } from '../utils/addressPath';
import { heightInput } from '../utils/blockHeight';
import { SEARCH_PAGE_SIZE as PAGE_SIZE, SearchType } from '../utils/search';
import { useSearchResults } from '../hooks/useSearchResults';
import '../styles/search-results.css';

const TYPE_LABELS: Record<string, string> = {
  block: 'Block',
  transfer: 'Transfer',
  deployment: 'Transaction',
};

function relativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return '';
  }
}

const SearchResultsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = (params.get('q') || '').trim();
  const type = (['blocks', 'transfers', 'deployments'].includes(params.get('type') || '')
    ? params.get('type') : 'all') as SearchType;
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { rows, hasMore, loading, error } = useSearchResults(query, page, order, type);
  const height = heightInput(query);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
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
      if (type === 'all' && isVaultAddress(value)) navigate(addressPath(value));
      else update('q', value);
    }}>
      <label className="search-results__sr-only" htmlFor="search-query">
        Block height or hash, transaction ID, or address
      </label>
      <div className="search-results__field">
        <Search size={18} aria-hidden="true" />
        <input id="search-query" name="query" key={query} defaultValue={query}
          placeholder="Block height or hash, transaction ID, or address"
          autoComplete="off" spellCheck={false} />
      </div>
      <button type="submit" className="btn btn-primary search-results__submit">Search</button>
    </form>

    {isVaultAddress(query) && (
      <Link className="search-results__wallet" to={addressPath(query)}>
        View wallet address
        <span aria-hidden="true">→</span>
      </Link>
    )}
    {height !== null && (
      <Link className="search-results__height" to={`/block/${height}`}>
        View all blocks at height #{height}
        <span aria-hidden="true">→</span>
      </Link>
    )}

    <div className="search-results__toolbar">
      <label className="search-results__select">Type
        <select aria-label="Result type" value={type} onChange={e => update('type', e.target.value)}>
          <option value="all">All</option><option value="blocks">Blocks</option>
          <option value="transfers">Transfers</option><option value="deployments">Transactions</option>
        </select>
      </label>
      <label className="search-results__select">Order
        <select aria-label="Result order" value={order} onChange={e => update('order', e.target.value)}>
          <option value="desc">Newest first</option><option value="asc">Oldest first</option>
        </select>
      </label>
    </div>

    {!query ? <p className="search-results__empty">Enter a query to search the indexed chain.</p>
      : loading ? <p className="search-results__empty" role="status">Searching…</p>
        : error ? <p className="search-results__error" role="alert">Search failed: {error.message}</p> : <>
          <p className="search-results__summary">
            {rows.length
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length} results`
              : 'No results'} for “{query}”
          </p>
          {rows.length === 0 ? <p className="search-results__empty">
            Try a block height or hash, a transaction ID, or a wallet address.
          </p> : (
            <ol className="search-results__list">
              {rows.map(row => {
                const label = TYPE_LABELS[row.type] || row.type;
                const iso = Number.isFinite(row.timestamp) && row.timestamp > 0
                  ? new Date(row.timestamp).toISOString() : undefined;
                return <li key={row.id} className="search-results__row">
                  <span className={`search-results__badge search-results__badge--${row.type}`}>{label}</span>
                  <div className="search-results__body">
                    <Link className="search-results__title" to={row.path}
                      title={row.data?.deploy_id || row.data?.block_hash || row.title}>
                      {row.title}
                    </Link>
                    <p className="search-results__description">{row.description}</p>
                    <small className="search-results__meta">
                      {iso
                        ? <time dateTime={iso} title={iso}>{relativeTime(row.timestamp)}</time>
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
