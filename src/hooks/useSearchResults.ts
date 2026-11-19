import { useApolloClient } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { loadSearchPage, SEARCH_INDEX, SearchCheckpoints, SearchPage, searchResults, SearchType, searchVariables } from '../utils/search';

interface SearchState extends SearchPage {
  key: string;
  loading: boolean;
  error: Error | null;
}

export function useSearchResults(query: string, page: number, order: 'asc' | 'desc', type: SearchType) {
  const client = useApolloClient();
  const checkpointState = useRef<{ client: typeof client; key: string; pages: SearchCheckpoints } | null>(null);
  const key = JSON.stringify([query, page, order, type]);
  const [state, setState] = useState<SearchState>({ key: '', rows: [], hasMore: false, loading: false, error: null });
  useEffect(() => {
    const searchKey = JSON.stringify([query, order, type]);
    if (checkpointState.current?.client !== client || checkpointState.current.key !== searchKey) {
      checkpointState.current = { client, key: searchKey, pages: new Map() };
    }
    const checkpoints = checkpointState.current.pages;
    const controller = new AbortController();
    setState({ key, rows: [], hasMore: false, loading: !!query, error: null });
    if (query) {
      void loadSearchPage(async (stream, offset, limit, cursor) => {
        const { data } = await client.query({
          query: SEARCH_INDEX,
          variables: searchVariables(query, limit, order, stream, offset, cursor),
          fetchPolicy: 'no-cache',
          // Reject HTTP-200 GraphQL errors instead of paging an empty or partial stream.
          errorPolicy: 'none',
          context: { fetchOptions: { signal: controller.signal }, queryDeduplication: false },
        });
        return searchResults(data, order);
      }, page, order, type, controller.signal, checkpoints).then(result => {
        if (!controller.signal.aborted) setState({ key, ...result, loading: false, error: null });
      }).catch(error => {
        if (!controller.signal.aborted) {
          controller.abort();
          setState({ key, rows: [], hasMore: false, loading: false,
            error: error instanceof Error ? error : new Error('Search request failed') });
        }
      });
    }
    return () => controller.abort();
  }, [client, key, query, page, order, type]);
  // Never render rows or navigation from an earlier URL while its effect cleans up.
  return state.key === key ? state : { rows: [], hasMore: false, loading: !!query, error: null };
}
