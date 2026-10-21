import { gql } from '@apollo/client';
import { decimalText } from './amounts';
import { getBlockPath } from './blockPath';

export type SearchType = 'all' | 'blocks' | 'transfers' | 'deployments';
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
    $deployments: deployments_bool_exp!, $limit: Int!, $order: order_by!) {
    blocks(where: $blocks, limit: $limit, order_by: [{timestamp: $order}, {block_hash: asc}]) {
      block_hash block_number timestamp proposer
    }
    transfers(where: $transfers, limit: $limit, order_by: [{timestamp: $order}, {id: asc}]) {
      id deploy_id block_hash block_number timestamp from_address to_address
      amount_dust amount_asi token_decimals status
    }
    deployments(where: $deployments, limit: $limit, order_by: [{timestamp: $order}, {deploy_id: asc}]) {
      deploy_id block_hash block_number timestamp deployer deployer_address errored deployment_type
    }
  }
`;

export function searchVariables(query: string, limit: number, order: 'asc' | 'desc', type: SearchType) {
  const value = query.trim();
  const pattern = `%${value.replace(/[\\%_]/g, '\\$&')}%`;
  const disabled = { _or: [] };
  const height = /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n
    ? [{ block_number: { _eq: BigInt(value).toString() } }] : [];
  return {
    limit, order,
    blocks: value && (type === 'all' || type === 'blocks') ? { _or: [
      ...height, { block_hash: { _ilike: pattern } }, { proposer: { _ilike: pattern } }
    ] } : disabled,
    transfers: value && (type === 'all' || type === 'transfers') ? { _or: [
      { deploy_id: { _ilike: pattern } }, { from_address: { _like: pattern } },
      { to_address: { _like: pattern } }, ...height
    ] } : disabled,
    deployments: value && (type === 'all' || type === 'deployments') ? { _or: [
      { deploy_id: { _ilike: pattern } }, { deployer: { _ilike: pattern } },
      { deployer_address: { _like: pattern } }, ...height
    ] } : disabled
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
  return results.sort((a, b) => (order === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp)
    || (a.type !== b.type ? (a.type < b.type ? -1 : 1) : a.type === 'transfer'
      ? (BigInt(a.data.id) < BigInt(b.data.id) ? -1 : BigInt(a.data.id) > BigInt(b.data.id) ? 1 : 0)
      : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
