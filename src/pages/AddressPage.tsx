import React, { useEffect, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { Link, useParams } from 'react-router-dom';
import { getPublicConfig } from '../runtimeConfig';
import { decimalText, formatRaw, validateDecimals } from '../utils/amounts';
import { isVaultAddress } from '../utils/addressPath';
import { getBlockPath } from '../utils/blockPath';
import { blockHeight } from '../utils/blockHeight';
import { CURRENT_TOKEN } from '../utils/constants';
import WalletAddressLink from '../components/WalletAddressLink';

const PAGE_SIZE = 20;
export const ADDRESS_TRANSFERS = gql`
  query AddressTransfers($address: String!, $limit: Int!, $offset: Int!) {
    indexer_state(where: {key: {_eq: "last_indexed_block"}}, limit: 1) { value }
    transfers(where: {_or: [{from_address: {_eq: $address}}, {to_address: {_eq: $address}}]},
      order_by: [{block_number: desc}, {id: desc}], limit: $limit, offset: $offset) {
      id deploy_id from_address to_address amount_asi block_number
    }
  }
`;

interface Transfer {
  id: string; deploy_id: string; from_address: string; to_address: string;
  amount_asi: string; block_number: number;
}

function AddressDetails({ address }: { address: string }) {
  const [balance, setBalance] = useState<{ amount: string; hash: string; height: number }>();
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const history = useQuery<{ transfers: Transfer[]; indexer_state: { value: string }[] }>(ADDRESS_TRANSFERS, {
    variables: { address, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 30000);
    async function load() {
      try {
        const base = getPublicConfig().indexerApiUrl.replace(/\/+$/, '');
        const response = await fetch(`${base}/address/${encodeURIComponent(address)}`,
          { signal: controller.signal, cache: 'no-store' });
        if (response.status === 400) {
          if (active) setError('Invalid ASI address.');
          return;
        }
        if (!response.ok) throw new Error();
        const row = await response.json();
        if (row.address !== address || typeof row.balance !== 'string' ||
            typeof row.block_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(row.block_hash) ||
            !Number.isSafeInteger(row.block_number) || row.block_number < 0) throw new Error();
        const amount = formatRaw(row.balance, validateDecimals(row.token_decimals));
        if (active) setBalance({ amount, hash: row.block_hash, height: row.block_number });
      } catch {
        if (active) setError('Balance unavailable.');
      } finally {
        clearTimeout(timeout);
      }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [address]);

  const rows = history.data?.transfers ?? [];
  const indexedHeight = blockHeight(history.data?.indexer_state?.[0]?.value);
  const lag = balance && indexedHeight !== null ? BigInt(balance.height) - indexedHeight : null;
  return <section className="asi-card" style={{ overflowWrap: 'anywhere' }}>
    <h1>Wallet address</h1><code>{address}</code>
    <h2>Spendable balance</h2>
    {error ? <p role="alert">{error}</p> : balance ? <>
      <strong>{balance.amount} {CURRENT_TOKEN}</strong>
      <p>Finalized block <Link to={getBlockPath(balance.hash)}>#{balance.height}</Link></p>
    </> : <p role="status">Loading balance…</p>}
    <h2>Transfer history</h2>
    {!history.loading && !history.error && <p>
      {indexedHeight === null ? 'Indexed height unavailable.' : `Indexed through block #${indexedHeight}.`}
      {lag !== null && lag > 0n && <strong className="text-warning" role="status">
        {` History is ${lag} ${lag === 1n ? 'block' : 'blocks'} behind the balance. Recent transfers may be missing.`}
      </strong>}
    </p>}
    {history.loading ? <p role="status">Loading transfers…</p>
      : history.error ? <p role="alert">Transfer history unavailable.</p>
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
    {(page > 0 || rows.length > PAGE_SIZE) && <div className="pagination-controls">
      <button disabled={page === 0 || history.loading} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page + 1}</span>
      <button disabled={history.loading || rows.length <= PAGE_SIZE} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </section>;
}

export default function AddressPage() {
  const { address = '' } = useParams();
  return isVaultAddress(address) ? <AddressDetails key={address} address={address} />
    : <p role="alert">Invalid ASI address.</p>;
}
