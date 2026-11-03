import { useEffect, useState } from 'react';

export interface IndexerStatus {
  lastIndexedBlock: number | null;
  latestBlock: number | null;
  lastUpdate: Date | null;
  lag: number | null;
  percentage: number | null;
  label: 'Synced' | 'Syncing' | 'Waiting for first block' | 'Stopped' | 'Unavailable';
}

function readStatus(value: any): IndexerStatus {
  const indexer = value?.indexer;
  const node = value?.node;
  if (value?.error || typeof indexer?.running !== 'boolean' ||
      typeof node?.connected !== 'boolean' ||
      !Number.isSafeInteger(indexer.last_indexed_block) || indexer.last_indexed_block < -1 ||
      (node.connected && (!Number.isSafeInteger(node.latest_block) || node.latest_block < 0))) {
    throw new Error('Invalid indexer status');
  }
  const lastIndexedBlock = indexer.last_indexed_block < 0 ? null : indexer.last_indexed_block;
  const latestBlock = node.connected ? node.latest_block as number : null;
  // The supported deployment runs PostgreSQL in UTC; its timestamps omit the suffix.
  const timestamp = indexer.last_sync_time;
  const parsed = typeof timestamp === 'string'
    ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) ? timestamp : timestamp + 'Z')
    : null;
  const lastUpdate = lastIndexedBlock !== null && parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
  const lag = lastIndexedBlock !== null && latestBlock !== null
    ? Math.max(0, latestBlock - lastIndexedBlock) : null;
  const percentage = latestBlock === null ? null : lastIndexedBlock === null ? 0
    : latestBlock === 0 ? 100 : Math.min(100, lastIndexedBlock / latestBlock * 100);
  return {
    lastIndexedBlock, latestBlock, lastUpdate, lag, percentage,
    label: !indexer.running ? 'Stopped' : !node.connected ? 'Unavailable'
      : lastIndexedBlock === null ? 'Waiting for first block'
      : lag === 0 ? 'Synced' : 'Syncing',
  };
}

export function useIndexerStatus() {
  const [state, setState] = useState<{
    data: IndexerStatus | null; loading: boolean; error: boolean;
  }>({ data: null, loading: true, error: false });
  useEffect(() => {
    let disposed = false;
    let nextPoll: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController;
    const base = (process.env.REACT_APP_INDEXER_API_URL || '/api/indexer').replace(/\/+$/, '');
    const poll = async () => {
      controller = new AbortController();
      requestTimeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`${base}/status`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Status request failed');
        const data = readStatus(await response.json());
        if (!disposed) setState({ data, loading: false, error: false });
      } catch {
        // Clear the previous snapshot: a failed poll must not leave a green status.
        if (!disposed) setState({ data: null, loading: false, error: true });
      } finally {
        clearTimeout(requestTimeout);
        if (!disposed) nextPoll = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(nextPoll);
      clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, []);
  return state;
}
