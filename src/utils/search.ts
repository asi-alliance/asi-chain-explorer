import { gql } from '@apollo/client';
import { decimalText } from './amounts';
import { getBlockPath } from './blockPath';
import { heightInput } from './blockHeight';

export type SearchType = 'all' | 'blocks' | 'transfers' | 'deployments';
export type SearchStream = Exclude<SearchType, 'all'>;
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_BATCH_SIZE = 200;
const streamId = { blocks: 'block_hash', transfers: 'id', deployments: 'deploy_id' } as const;
const streamType = { blocks: 'block', transfers: 'transfer', deployments: 'deployment' } as const;
export interface SearchCursor { timestamp: string; id: string; type: SearchResult['type'] }
export type SearchCheckpoints = Map<number, SearchCursor | undefined>;
export interface SearchResult {
  type: 'block' | 'transfer' | 'deployment';
  id: string;
  title: string;
  description: string;
  path: string;
  timestamp: number;
  data: any;
}

export const SEARCH_INDEX = gql`
  query SearchIndex($blocks: blocks_bool_exp!, $transfers: transfers_bool_exp!,
    $deployments: deployments_bool_exp!, $limit: Int!, $offset: Int!, $order: order_by!) {
    blocks(where: $blocks, limit: $limit, offset: $offset, order_by: [{timestamp: $order}, {block_hash: asc}]) {
      block_hash block_number timestamp proposer
    }
    transfers(where: $transfers, limit: $limit, offset: $offset, order_by: [{timestamp: $order}, {id: asc}]) {
      id deploy_id block_hash block_number timestamp from_address to_address
      amount_dust amount_asi token_decimals status
    }
    deployments(where: $deployments, limit: $limit, offset: $offset, order_by: [{timestamp: $order}, {deploy_id: asc}]) {
      deploy_id block_hash block_number timestamp deployer deployer_address errored deployment_type
    }
  }
`;

export function searchVariables(query: string, limit: number, order: 'asc' | 'desc', type: SearchType,
  offset = 0, cursor?: SearchCursor) {
  const value = query.trim();
  const pattern = `%${value.replace(/[\\%_]/g, '\\$&')}%`;
  const disabled = { _or: [] };
  const exactHeight = heightInput(value);
  const height = exactHeight === null ? [] : [{ block_number: { _eq: exactHeight } }];
  const afterCursor = (stream: SearchStream, filter: object) => {
    if (!cursor || type !== stream) return filter;
    // A saved page boundary is a global (timestamp, type, id) cursor. Include
    // equal timestamps only for types/IDs that follow it in the merged order.
    const sameTime = streamType[stream] > cursor.type ? [{ timestamp: { _eq: cursor.timestamp } }]
      : streamType[stream] === cursor.type ? [{ timestamp: { _eq: cursor.timestamp }, [streamId[stream]]: { _gt: cursor.id } }] : [];
    return { _and: [filter, { _or: [
      { timestamp: { [order === 'desc' ? '_lt' : '_gt']: cursor.timestamp } }, ...sameTime,
    ] }] };
  };
  return {
    limit, offset, order,
    blocks: afterCursor('blocks', value && (type === 'all' || type === 'blocks') ? { _or: [
      ...height, { block_hash: { _ilike: pattern } }, { proposer: { _ilike: pattern } }
    ] } : disabled),
    transfers: afterCursor('transfers', value && (type === 'all' || type === 'transfers') ? { _or: [
      { deploy_id: { _ilike: pattern } }, { from_address: { _like: pattern } },
      { to_address: { _like: pattern } }, ...height
    ] } : disabled),
    deployments: afterCursor('deployments', value && (type === 'all' || type === 'deployments') ? { _or: [
      { deploy_id: { _ilike: pattern } }, { deployer: { _ilike: pattern } },
      { deployer_address: { _like: pattern } }, ...height
    ] } : disabled),
  };
}

export function searchResults(data: any, order: 'asc' | 'desc'): SearchResult[] {
  const results: SearchResult[] = [
    ...(data?.blocks || []).map((b: any) => ({
      type: 'block', id: `block:${b.block_hash}`, title: `Block #${b.block_number}`,
      description: b.block_hash, path: getBlockPath(b.block_hash, b.block_number), timestamp: Number(b.timestamp), data: b
    })),
    ...(data?.transfers || []).map((t: any) => ({
      type: 'transfer', id: `transfer:${t.id}`, title: `${decimalText(t.amount_asi)} ASI Transfer`,
      description: `${t.from_address} → ${t.to_address} (${t.status})`,
      path: `/transaction/${encodeURIComponent(t.deploy_id)}`, timestamp: Number(t.timestamp), data: t
    })),
    ...(data?.deployments || []).map((d: any) => ({
      type: 'deployment', id: `deployment:${d.deploy_id}`, title: `Deployment ${d.deploy_id}`,
      description: `From ${d.deployer_address || d.deployer}${d.errored ? ' (failed)' : ''}`,
      path: `/transaction/${encodeURIComponent(d.deploy_id)}`, timestamp: Number(d.timestamp), data: d
    }))
  ];
  return results.sort((a, b) => compareSearchResults(a, b, order));
}

function compareSearchResults(a: SearchResult, b: SearchResult, order: 'asc' | 'desc') {
  return (order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp)
    || (a.type !== b.type ? (a.type < b.type ? -1 : 1) : a.type === 'transfer'
      ? (BigInt(a.data.id) < BigInt(b.data.id) ? -1 : BigInt(a.data.id) > BigInt(b.data.id) ? 1 : 0)
      : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface SearchPage {
  rows: SearchResult[];
  hasMore: boolean;
}

export async function loadSearchPage(
  fetchStream: (stream: SearchStream, offset: number, limit: number, cursor?: SearchCursor) => Promise<SearchResult[]>,
  page: number, order: 'asc' | 'desc', type: SearchType, signal: AbortSignal,
  checkpoints: SearchCheckpoints = new Map(),
): Promise<SearchPage> {
  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset + SEARCH_PAGE_SIZE)) {
    throw new Error('Search page is out of range');
  }
  const fetch = async (stream: SearchStream, start: number, limit: number, cursor?: SearchCursor) => {
    if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError');
    // Hasura's offset is a GraphQL Int; do not send an overflowing variable.
    if (start > 2147483647) throw new Error('Search offset is out of range');
    return cursor ? fetchStream(stream, start, limit, cursor) : fetchStream(stream, start, limit);
  };
  if (type !== 'all') {
    const rows = await fetch(type, offset, SEARCH_PAGE_SIZE + 1);
    return { rows: rows.slice(0, SEARCH_PAGE_SIZE), hasMore: rows.length > SEARCH_PAGE_SIZE };
  }

  // Resume a recent page boundary when navigating. A fresh deep link still
  // scans bounded batches, but keyset continuation avoids repeated OFFSET
  // scans and does not duplicate/skip rows when earlier history changes.
  const startPage = Math.max(1, ...Array.from(checkpoints.keys()).filter(saved => saved <= page));
  let boundary = checkpoints.get(startPage);
  const streams = (['blocks', 'transfers', 'deployments'] as SearchStream[]).map(stream => ({
    stream, rows: [] as SearchResult[], index: 0, cursor: boundary, done: false,
  }));
  const rows: SearchResult[] = [];
  for (let position = (startPage - 1) * SEARCH_PAGE_SIZE; position <= offset + SEARCH_PAGE_SIZE; position++) {
    if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError');
    if (position % SEARCH_PAGE_SIZE === 0) {
      const nextPage = position / SEARCH_PAGE_SIZE + 1;
      checkpoints.delete(nextPage);
      checkpoints.set(nextPage, boundary);
      // Cursor metadata is bounded too; a missing older checkpoint can be rebuilt.
      if (checkpoints.size > 32) checkpoints.delete(checkpoints.keys().next().value!);
    }
    await Promise.all(streams.filter(stream => stream.index === stream.rows.length && !stream.done)
      .map(async stream => {
        stream.rows = await fetch(stream.stream, 0, SEARCH_BATCH_SIZE, stream.cursor);
        stream.index = 0;
        stream.done = stream.rows.length < SEARCH_BATCH_SIZE;
      }));
    if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const available = streams.filter(stream => stream.index < stream.rows.length);
    available.sort((a, b) => compareSearchResults(a.rows[a.index], b.rows[b.index], order));
    if (!available.length) break;
    const first = available[0];
    const result = first.rows[first.index++];
    boundary = { timestamp: String(result.data.timestamp), id: String(result.data[streamId[first.stream]]), type: result.type };
    first.cursor = boundary;
    if (position >= offset) rows.push(result);
    if (rows.length > SEARCH_PAGE_SIZE) return { rows: rows.slice(0, SEARCH_PAGE_SIZE), hasMore: true };
  }
  return { rows, hasMore: false };
}
