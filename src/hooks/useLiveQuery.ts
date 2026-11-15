import { useQuery, useSubscription } from '@apollo/client';
import type { ApolloError, DocumentNode, OperationVariables } from '@apollo/client';

// Used only after the WebSocket subscription failed.
export const LIVE_FALLBACK_POLL_MS = 5000;

export interface LiveQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ApolloError | undefined;
  /** True while results arrive over the WebSocket, false while polling over HTTP. */
  live: boolean;
}

interface LiveQueryOptions<V> {
  variables?: V;
  skip?: boolean;
  fallbackPollMs?: number;
}

/**
 * Reads the subscription document over the GraphQL WebSocket and switches to
 * polling the equivalent query document over HTTP when the subscription fails
 * (for example when a proxy blocks WebSockets and graphql-ws stops reconnecting).
 *
 * Hasura serves subscriptions as multiplexed live queries: it runs one SQL
 * query per refetch interval for all clients that subscribe to the same query
 * shape and pushes a result only when it changed. Every polling client, by
 * contrast, sends its own HTTP request each interval.
 */
export function useLiveQuery<T = any, V extends OperationVariables = OperationVariables>(
  subscription: DocumentNode,
  query: DocumentNode,
  { variables, skip = false, fallbackPollMs = LIVE_FALLBACK_POLL_MS }: LiveQueryOptions<V> = {},
): LiveQueryResult<T> {
  const live = useSubscription<T, V>(subscription, { variables, skip });
  const fallback = !skip && live.error !== undefined;
  const polled = useQuery<T, V>(query, {
    variables,
    skip: !fallback,
    pollInterval: fallback ? fallbackPollMs : 0,
    notifyOnNetworkStatusChange: false,
  });

  if (fallback) {
    const data = polled.data ?? live.data;
    return {
      data,
      loading: polled.loading && data === undefined,
      error: polled.error,
      live: false,
    };
  }
  return { data: live.data, loading: !skip && live.loading, error: undefined, live: !skip };
}
