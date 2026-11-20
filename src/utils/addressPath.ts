// Recognize a full Base58 vault address. The indexer verifies its checksum.
export function isVaultAddress(value: string): boolean {
  return /^1111[1-9A-HJ-NP-Za-km-z]{36,50}$/.test(value);
}

export function addressPath(address: string): string {
  return `/address/${encodeURIComponent(address)}`;
}
