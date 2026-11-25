# Explorer roadmap

Current focus: keep the universal search convenient while making DAG heights
unambiguous. This file records the remaining UI work; backend blockers live in
[asi-chain-indexer#66](https://github.com/asi-alliance/asi-chain-indexer/issues/66).

## Shipped in PR #79

- One header omnibox for heights, block hashes, transaction IDs, transfers and
  wallet addresses, with grouped results and `Ctrl/Cmd+K` palette.
- Recent searches in local storage.
- Exact pending-deploy lookup by signature in the header and on `/search`.
- Height-first numeric search; a numeric query no longer scans hashes and IDs.
- `/block/{height}` sibling overview with prev/next height navigation,
  finalized/unfinalized filtering, parent/child counts and block-hash rows.
- Recent Blocks grouping: one height cell per sibling group, block count,
  real finalization status and a local finalized-only filter. The finalized
  filter keeps polling, while only a text search pauses it.
- The legacy `/blocks` path redirects to the home page.
- Search result type tabs and copy/share actions.
- Mobile search panel and height overview.
- A 404 page for unknown paths, with the attempted path, the chain search
  and recovery links.

## Frontend-only next

Tracked in
[asi-chain-explorer#83](https://github.com/asi-alliance/asi-chain-explorer/issues/83).

- [ ] Mobile Recent Blocks: sticky Height column, or a card view below 600 px.
- [ ] Loading skeletons and explicit error/retry states for stats, Recent
      Blocks and height summaries. Remove the `/favicon.svg` 404.
- [ ] Keep the Home search/filter state in the URL so back/forward and copied
      links restore it.
- [ ] Add a compact status legend to Recent Blocks (Confirmed / Unfinalized).
- [ ] Revisit the home filter row on narrow screens after the mobile table work.

## Blocked by the indexer / Hasura

Tracked in
[asi-chain-indexer#66](https://github.com/asi-alliance/asi-chain-indexer/issues/66):

- Exact height counts and grouped-by-height pagination across pages.
- Counts on `/search` type tabs.
- `pg_trgm` indexes and a ranked unified search surface for `%term%` queries.
- Removing the `6+`/`100+` count caps once public aggregates are available.
