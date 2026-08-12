import { Block, BlockParent } from "../types";

// Returns all parent hashes for a block (DAG may have multiple parents).
// Falls back to the legacy single `parent_hash` field when `parent_links` is absent.
export const getParentHashes = (block?: Block | null): string[] => {
  if (!block) return [];
  if (block.parent_links && block.parent_links.length > 0) {
    return [...block.parent_links]
      .sort((a, b) => a.parent_index - b.parent_index)
      .map((p: BlockParent) => p.parent_hash);
  }
  return block.parent_hash ? [block.parent_hash] : [];
};

// Returns the primary (lowest parent_index) parent hash, or the legacy
// `parent_hash` value, or undefined when the block has no parents (genesis).
export const getPrimaryParentHash = (block?: Block | null): string | undefined => {
  const hashes = getParentHashes(block);
  return hashes.length > 0 ? hashes[0] : undefined;
};