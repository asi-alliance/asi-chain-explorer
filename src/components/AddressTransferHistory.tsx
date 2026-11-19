import React, { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import WalletAddressLink from './WalletAddressLink';
import { decimalText } from '../utils/amounts';
import { blockHeight } from '../utils/blockHeight';
import { CURRENT_TOKEN } from '../utils/constants';

const PAGE_SIZE = 20;

const HISTORY_BOUNDS = gql`
  query AddressHistoryBounds {
    indexer_state(where: {key: {_eq: "last_indexed_block"}}, limit: 1) { value }
    newest: transfers(order_by: {id: desc}, limit: 1) { id }
  }
`;

const ADDRESS_TRANSFERS = gql`
  query AddressTransfers($where: transfers_bool_exp!, $limit: Int!) {
    transfers(where: $where, order_by: [{block_number: desc}, {id: desc}], limit: $limit) {
      id deploy_id from_address to_address amount_asi block_number
    }
  }
`;

export type Direction = 'all' | 'incoming' | 'outgoing';
type Cursor = { block_number: string | number; id: string | number };
interface Transfer extends Cursor {
  deploy_id: string;
  from_address: string;
  to_address: string;
  amount_asi: string;
}

interface PageProps {
  address: string;
  direction: Direction;
  maxId: string;
  indexedHeight: bigint | null;
}

function TransferPages({ address, direction, maxId, indexedHeight }: PageProps) {
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const after = cursors[cursors.length - 1];
  const sender = { from_address: { _eq: address } };
  const recipient = { to_address: { _eq: address } };
  const directions = { all: { _or: [sender, recipient] }, incoming: recipient, outgoing: sender };
  const where = { _and: [
    directions[direction],
    { id: { _lte: maxId } },
    ...(indexedHeight === null ? [] : [{ block_number: { _lte: indexedHeight.toString() } }]),
    ...(after ? [{ _or: [
      { block_number: { _lt: after.block_number } },
      { block_number: { _eq: after.block_number }, id: { _lt: after.id } },
    ] }] : []),
  ] };
  const { data, loading, error } = useQuery<{ transfers: Transfer[] }>(ADDRESS_TRANSFERS, {
    variables: { where, limit: PAGE_SIZE + 1 }, fetchPolicy: 'no-cache', notifyOnNetworkStatusChange: true,
    context: { queryDeduplication: false },
  });
  const rows = data?.transfers ?? [];
  const last = rows[PAGE_SIZE - 1];
  const invalidCursor = rows.some(row => blockHeight(row.id) === null || blockHeight(row.block_number) === null);
  return <>
    {loading ? <p role="status">Loading transfers…</p>
      : error || invalidCursor ? <p role="alert">Transfer history unavailable.</p>
      : rows.length ? <table>
        <thead><tr><th>Block</th><th>From</th><th>To</th><th>Amount</th><th>Transaction</th></tr></thead>
        <tbody>{rows.slice(0, PAGE_SIZE).map(row => <tr key={row.id}>
          <td>{row.block_number}</td>
          <td><WalletAddressLink address={row.from_address} short /></td>
          <td><WalletAddressLink address={row.to_address} short /></td>
          <td>{decimalText(row.amount_asi)} {CURRENT_TOKEN}</td>
          <td><Link to={`/transaction/${encodeURIComponent(row.deploy_id)}`}>View transaction</Link></td>
        </tr>)}</tbody>
      </table> : <p>No indexed transfers found.</p>}
    {(cursors.length > 0 || rows.length > PAGE_SIZE) && <div className="pagination-controls">
      <button disabled={!cursors.length || loading} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button>
      <span>Page {cursors.length + 1}</span>
      <button disabled={loading || !!error || invalidCursor || rows.length <= PAGE_SIZE}
        onClick={() => setCursors([...cursors, { id: last.id, block_number: last.block_number }])}>Next</button>
    </div>}
  </>;
}

interface HistoryProps {
  address: string;
  balanceHeight?: number;
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
}

export default function AddressTransferHistory({ address, balanceHeight, direction, onDirectionChange }: HistoryProps) {
  const bounds = useQuery<{ indexer_state: { value: string }[]; newest: { id: string | number }[] }>(
    HISTORY_BOUNDS, { fetchPolicy: 'no-cache', context: { queryDeduplication: false } },
  );
  const indexedHeight = blockHeight(bounds.data?.indexer_state[0]?.value);
  const maxId = blockHeight(bounds.data?.newest[0]?.id);
  const lag = balanceHeight !== undefined && indexedHeight !== null ? BigInt(balanceHeight) - indexedHeight : null;
  return <>
    <h2>Transfer history</h2>
    <label>Direction <select value={direction} onChange={event => onDirectionChange(event.target.value as Direction)}>
      <option value="all">All transfers</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option>
    </select></label>
    {bounds.loading ? <p role="status">Loading transfers…</p>
      : bounds.error || !bounds.data ? <p role="alert">Transfer history unavailable.</p>
      : <>
        <p>{indexedHeight === null ? 'Indexed height unavailable.' : `Indexed through block #${indexedHeight}.`}
          {lag !== null && lag > 0n && <strong className="text-warning" role="status">
            {` History is ${lag} ${lag === 1n ? 'block' : 'blocks'} behind the balance. Recent transfers may be missing.`}
          </strong>}
        </p>
        {!bounds.data.newest.length ? <p>No indexed transfers found.</p>
          : maxId === null ? <p role="alert">Transfer history unavailable.</p>
          : <TransferPages key={direction} address={address} direction={direction} indexedHeight={indexedHeight} maxId={maxId.toString()} />}
      </>}
  </>;
}
