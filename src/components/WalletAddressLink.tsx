import React from 'react';
import { Link } from 'react-router-dom';
import { addressPath, isVaultAddress } from '../utils/addressPath';

export default function WalletAddressLink({ address, short = false }: { address: string; short?: boolean }) {
  const label = short && address.length > 12 ? address.slice(0, 12) + '…' : address;
  return isVaultAddress(address) ? <Link to={addressPath(address)} title={address}>{label}</Link> : <>{label}</>;
}
