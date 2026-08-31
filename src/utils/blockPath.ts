export const getBlockPath = (
  blockHash?: string | null,
  blockNumber?: string | number | null,
): string => {
  if (blockHash) {
    return `/block/hash/${encodeURIComponent(blockHash)}`;
  }

  return `/block/${blockNumber ?? ''}`;
};
