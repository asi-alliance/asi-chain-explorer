import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import type { ApolloError } from '@apollo/client';
import { GET_PENDING_DEPLOYS_STATUS, WATCH_PENDING_DEPLOYS_STATUS } from '../graphql/queries';
import { parsePendingDeploysStatus, PENDING_STATUS_KEY } from '../utils/pendingDeploys';
import type { PendingDeploysStatus } from '../utils/pendingDeploys';
import { useLiveQuery } from './useLiveQuery';

interface StatusData {
  indexer_state?: unknown;
}

function useParsedStatus(rows: unknown) {
  const status = parsePendingDeploysStatus(rows);
  const malformed = !status && Array.isArray(rows) && rows.some(row => row?.key === PENDING_STATUS_KEY);
  useEffect(() => {
    if (malformed) console.warn('Unreadable pending_deploys_status row from the indexer.');
  }, [malformed]);
  return status;
}

/**
 * Whether the indexer reads pending deploys. Pending deploys are optional: an
 * indexer reads them only when its PENDING_DEPLOYS_NODES lists the validators.
 * One cached request per page load; navigation and lookups share it.
 */
export function usePendingDeploysEnabled(): { enabled: boolean; loading: boolean } {
  const { data, loading, error } = useQuery<StatusData>(GET_PENDING_DEPLOYS_STATUS, {
    fetchPolicy: 'cache-first',
  });
  const status = useParsedStatus(data?.indexer_state);
  return {
    enabled: !error && status !== null,
    loading,
  };
}

export interface LivePendingDeploysStatus {
  status: PendingDeploysStatus | null;
  loading: boolean;
  error: ApolloError | undefined;
  live: boolean;
}

/** The indexer's pending-deploy status, updated live for freshness and reachability notes. */
export function useLivePendingDeploysStatus(skip = false): LivePendingDeploysStatus {
  const { data, loading, error, live } = useLiveQuery<StatusData>(
    WATCH_PENDING_DEPLOYS_STATUS,
    GET_PENDING_DEPLOYS_STATUS,
    { skip },
  );
  return { status: useParsedStatus(data?.indexer_state), loading, error, live };
}
