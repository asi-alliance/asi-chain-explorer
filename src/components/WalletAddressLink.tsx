import React from 'react';
import { Link } from 'react-router-dom';
import { addressPath, isVaultAddress } from '../utils/addressPath';

// A shortened label keeps both ends so similar addresses stay distinguishable.
export default function WalletAddressLink({ address, short = false }: { address: string; short?: boolean }) {
  const label = short && address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
  return isVaultAddress(address) ? <Link to={addressPath(address)} title={address}>{label}</Link> : <>{label}</>;
}
