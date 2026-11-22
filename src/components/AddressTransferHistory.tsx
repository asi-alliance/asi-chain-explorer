import React, { useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Database, Inbox,
} from 'lucide-react';
import WalletAddressLink from './WalletAddressLink';
import { groupThousands, decimalText } from '../utils/amounts';
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
  amount_asi: unknown;
}

const DIRECTIONS: Array<{ value: Direction; label: string; icon: React.ReactNode }> = [
  { value: 'all', label: 'All transfers', icon: <ArrowLeftRight aria-hidden="true" /> },
  { value: 'incoming', label: 'Incoming', icon: <ArrowDownLeft aria-hidden="true" /> },
  { value: 'outgoing', label: 'Outgoing', icon: <ArrowUpRight aria-hidden="true" /> },
];

function formatTransferRows(rows: Transfer[]) {
  try {
    return rows.map(row => ({ ...row, amount_asi: decimalText(row.amount_asi) }));
  } catch {
    return null;
  }
}

function transferDirection(row: Transfer, address: string): 'in' | 'out' | 'self' | null {
  const incoming = row.to_address === address;
  const outgoing = row.from_address === address;
  if (incoming && outgoing) return 'self';
  if (incoming) return 'in';
  if (outgoing) return 'out';
  return null;
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
  const transfers = data?.transfers ?? [];
  const hasNext = transfers.length > PAGE_SIZE;
  const formatted = formatTransferRows(transfers.slice(0, PAGE_SIZE));
  const rows = formatted ?? [];
  const last = rows[PAGE_SIZE - 1];
  const invalidCursor = rows.some(row => blockHeight(row.id) === null || blockHeight(row.block_number) === null);

  return <>
    {loading ? <p className="address-loading" role="status">
      <span className="loading" aria-hidden="true" /> Loading transfers…
    </p>
      : error || formatted === null || invalidCursor ? (
        <div className="address-alert address-alert--history" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Transfer history unavailable.</span>
        </div>
      )
      : rows.length ? (
        <div className="address-table-wrap">
          <table className="address-table" aria-label="Transfer history">
            <thead>
              <tr>
                <th scope="col">Block</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col" className="amount-cell">Amount</th>
                <th scope="col">Transaction</th>
              </tr>
            </thead>
            <tbody>{rows.map(row => {
              const kind = transferDirection(row, address);
              return <tr key={row.id}>
                <td className="block-cell">
                  <Link to={`/block/${encodeURIComponent(String(row.block_number))}`}>#{row.block_number}</Link>
                </td>
                <td className="mono"><WalletAddressLink address={row.from_address} short /></td>
                <td className="mono"><WalletAddressLink address={row.to_address} short /></td>
                <td className="amount-cell">
                  <div className="address-amount">
                    {direction === 'all' && kind && (
                      <span className={`address-direction address-direction--${kind}`}>
                        {kind === 'in' ? 'Incoming' : kind === 'out' ? 'Outgoing' : 'Self'}
                      </span>
                    )}
                    <span>{groupThousands(row.amount_asi)} {CURRENT_TOKEN}</span>
                  </div>
                </td>
                <td>
                  <Link className="address-tx-link" to={`/transaction/${encodeURIComponent(row.deploy_id)}`}>
                    View transaction <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : (
        <div className="address-empty">
          <Inbox size={32} aria-hidden="true" />
          <h3>{direction === 'all' ? 'No indexed transfers found.'
            : direction === 'incoming' ? 'No incoming transfers found.' : 'No outgoing transfers found.'}</h3>
          <p>{direction === 'all' ? 'Transfers to or from this address appear here once the indexer processes them.'
            : `This address has no ${direction} transfers in the indexed history.`}</p>
        </div>
      )}
    {(cursors.length > 0 || hasNext) && <nav className="address-pagination" aria-label="Transfer history pages">
      <button type="button" className="btn btn-secondary" disabled={!cursors.length || loading}
        onClick={() => setCursors(cursors.slice(0, -1))}>
        <ChevronLeft size={14} aria-hidden="true" /> Previous
      </button>
      <span aria-live="polite">Page {cursors.length + 1}</span>
      <button type="button" className="btn btn-secondary"
        disabled={loading || !!error || invalidCursor || !last || !hasNext}
        onClick={() => setCursors([...cursors, { id: last.id, block_number: last.block_number }])}>
        Next <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>}
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

  return (
    <section className="asi-card address-history" aria-labelledby="address-history-heading">
      <div className="address-history__header">
        <div>
          <h2 id="address-history-heading">Transfer history</h2>
          <p className="address-history__subtitle">Newest indexed transfers to and from this address.</p>
        </div>
        <div className="address-segmented" role="group" aria-label="Direction">
          {DIRECTIONS.map(option => (
            <button key={option.value} type="button" aria-pressed={direction === option.value}
              onClick={() => onDirectionChange(option.value)}>
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {bounds.loading ? (
        <p className="address-loading" role="status">
          <span className="loading" aria-hidden="true" /> Loading transfers…
        </p>
      ) : bounds.error || !bounds.data ? (
        <div className="address-alert address-alert--history" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Transfer history unavailable.</span>
        </div>
      ) : <>
        <div className="address-history__meta">
          <span className="address-history__checkpoint">
            <Database size={14} aria-hidden="true" />
            {indexedHeight === null ? 'Indexed height unavailable.' : `Indexed through block #${indexedHeight}.`}
          </span>
          {lag !== null && lag > 0n && (
            <span className="address-history__lag" role="status">
              <AlertTriangle size={14} aria-hidden="true" />
              {`History is ${lag} ${lag === 1n ? 'block' : 'blocks'} behind the balance. Recent transfers may be missing.`}
            </span>
          )}
        </div>
        {!bounds.data.newest.length ? (
          <div className="address-empty">
            <Inbox size={32} aria-hidden="true" />
            <h3>No indexed transfers found.</h3>
            <p>Transfers to or from this address appear here once the indexer processes them.</p>
          </div>
        ) : maxId === null ? (
          <div className="address-alert address-alert--history" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Transfer history unavailable.</span>
          </div>
        ) : (
          <TransferPages key={direction} address={address} direction={direction}
            indexedHeight={indexedHeight} maxId={maxId.toString()} />
        )}
      </>}
    </section>
  );
}
