import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SEARCH_PAGE_SIZE as PAGE_SIZE, SearchType } from '../utils/search';
import { useSearchResults } from '../hooks/useSearchResults';

const SearchResultsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  const type = (['blocks', 'transfers', 'deployments'].includes(params.get('type') || '')
    ? params.get('type') : 'all') as SearchType;
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const requestedPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { rows, hasMore, loading, error } = useSearchResults(query, page, order, type);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  return <section className="asi-card">
    <h1>Search Results</h1>
    <form onSubmit={event => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get('query')?.toString() || '';
      update('q', value.trim());
    }}>
      <label htmlFor="search-query">Block height or hash, deploy ID, or address</label>
      <input id="search-query" name="query" key={query} defaultValue={query} />
      <button type="submit" className="btn btn-primary">Search</button>
    </form>
    <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
      <label>Type <select aria-label="Result type" value={type} onChange={e => update('type', e.target.value)}>
        <option value="all">All</option><option value="blocks">Blocks</option>
        <option value="transfers">Transfers</option><option value="deployments">Deployments</option>
      </select></label>
      <label>Order <select aria-label="Result order" value={order} onChange={e => update('order', e.target.value)}>
        <option value="desc">Newest first</option><option value="asc">Oldest first</option>
      </select></label>
    </div>
    {!query ? <p>Enter a query to search the indexed chain.</p> : loading ? <p role="status">Searching…</p>
      : error ? <p role="alert">Search failed: {error.message}</p> : <>
        <p>{rows.length ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length} results` : 'No results'} for “{query}”</p>
        {rows.length === 0 ? <p>No results found.</p> : <ul style={{ paddingLeft: '1.5rem' }}>
          {rows.map(row => <li key={row.id} style={{ marginBottom: '1rem', overflowWrap: 'anywhere' }}>
            <Link to={row.path}>{row.title}</Link>
            <div>{row.description}</div>
            <small>{row.type} · {new Date(row.timestamp).toISOString()}</small>
          </li>)}
        </ul>}
        <div className="pagination-controls">
          <button disabled={page === 1} onClick={() => update('page', String(page - 1))}>Previous</button>
          <span> Page {page} </span>
          <button disabled={!hasMore} onClick={() => update('page', String(page + 1))}>Next</button>
        </div>
      </>}
  </section>;
};
export default SearchResultsPage;
