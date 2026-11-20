import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ApolloError } from '@apollo/client';
import { GET_PENDING_DEPLOYS_STATUS, WATCH_PENDING_DEPLOYS_STATUS } from '../graphql/queries';
import { parsePendingDeploysStatus, PENDING_STATUS_KEY } from '../utils/pendingDeploys';
import type { PendingDeploysStatus } from '../utils/pendingDeploys';
import { useLiveQuery } from './useLiveQuery';

interface StatusResult {
  status: PendingDeploysStatus | null;
  loading: boolean;
  error: ApolloError | undefined;
  live: boolean;
}

const StatusContext = createContext<StatusResult | null>(null);

export function PendingDeploysStatusProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, live } = useLiveQuery<{ indexer_state?: unknown }>(
    WATCH_PENDING_DEPLOYS_STATUS, GET_PENDING_DEPLOYS_STATUS,
  );
  const rows = data?.indexer_state;
  const status = parsePendingDeploysStatus(rows);
  const malformed = !status && Array.isArray(rows) && rows.some(row => row?.key === PENDING_STATUS_KEY);
  useEffect(() => {
    if (malformed) console.warn('Unreadable pending_deploys_status row from the indexer.');
  }, [malformed]);
  return <StatusContext.Provider value={{ status, loading, error, live }}>{children}</StatusContext.Provider>;
}

export function usePendingDeploysStatus() {
  const value = useContext(StatusContext);
  if (!value) throw new Error('PendingDeploysStatusProvider is required');
  return value;
}
