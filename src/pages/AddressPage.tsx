import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicConfig } from '../runtimeConfig';
import { formatRaw, validateDecimals } from '../utils/amounts';
import { isVaultAddress } from '../utils/addressPath';
import { getBlockPath } from '../utils/blockPath';
import { CURRENT_TOKEN } from '../utils/constants';
import AddressTransferHistory, { Direction } from '../components/AddressTransferHistory';

function AddressDetails({ address }: { address: string }) {
  const [direction, setDirection] = useState<Direction>('all');
  const [revision, setRevision] = useState(0);
  return <section className="asi-card" style={{ overflowWrap: 'anywhere' }}>
    <h1>Wallet address</h1><code>{address}</code>
    <div><button type="button" className="btn btn-secondary" onClick={() => setRevision(value => value + 1)}>
      Refresh
    </button></div>
    <AddressSnapshot key={revision} address={address} direction={direction} onDirectionChange={setDirection} />
  </section>;
}

interface AddressSnapshotProps {
  address: string;
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
}

function AddressSnapshot({ address, direction, onDirectionChange }: AddressSnapshotProps) {
  const [balance, setBalance] = useState<{ amount: string; hash: string; height: number }>();
  const [error, setError] = useState('');
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

  return <>
    <h2>Spendable balance</h2>
    {error ? <p role="alert">{error}</p> : balance ? <>
      <strong>{balance.amount} {CURRENT_TOKEN}</strong>
      <p>Finalized block <Link to={getBlockPath(balance.hash)}>#{balance.height}</Link></p>
    </> : <p role="status">Loading balance…</p>}
    <AddressTransferHistory address={address} balanceHeight={balance?.height}
      direction={direction} onDirectionChange={onDirectionChange} />
  </>;
}

export default function AddressPage() {
  const { address = '' } = useParams();
  return isVaultAddress(address) ? <AddressDetails key={address} address={address} />
    : <p role="alert">Invalid ASI address.</p>;
}
