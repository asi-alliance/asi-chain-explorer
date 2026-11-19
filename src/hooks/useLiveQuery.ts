import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import type { ApolloError, DocumentNode, OperationVariables } from '@apollo/client';

// Used only after the WebSocket subscription failed.
export const LIVE_FALLBACK_POLL_MS = 5000;

const LIVE_RETRY_MS = 30_000;

function subscribeVisibility(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}

const pageVisible = () => document.visibilityState !== 'hidden';

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
 * Hidden tabs release their subscriptions. Visible tabs continue polling during
 * reconnect attempts until the subscription returns fresh data.
 */
export function useLiveQuery<T = any, V extends OperationVariables = OperationVariables>(
  subscription: DocumentNode,
  query: DocumentNode,
  { variables, skip = false, fallbackPollMs = LIVE_FALLBACK_POLL_MS }: LiveQueryOptions<V> = {},
): LiveQueryResult<T> {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible);
  const paused = skip || !visible;
  const [recovering, setRecovering] = useState(false);
  const live = useSubscription<T, V>(subscription, { variables, skip: paused });
  const failed = !!live.error;
  const received = !live.loading && live.data !== undefined && !failed;
  const fallback = !paused && (failed || (recovering && !received));
  useEffect(() => {
    if (paused || received) setRecovering(false);
    else if (failed) setRecovering(true);
  }, [paused, failed, received]);
  const { restart } = live;
  useEffect(() => {
    if (!fallback) return;
    const timer = window.setInterval(restart, LIVE_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [fallback, restart]);
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
  return { data: live.data, loading: !skip && (!visible || live.loading), error: undefined, live: !paused };
}
