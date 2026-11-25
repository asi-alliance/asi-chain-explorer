# Explorer roadmap

Current focus: the frontend polish tracked in
[asi-chain-explorer#83](https://github.com/asi-alliance/asi-chain-explorer/issues/83).
This file records what PR #79 ships and what remains; backend-dependent scope
lives in
[asi-chain-indexer#66](https://github.com/asi-alliance/asi-chain-indexer/issues/66).

## Shipped in PR #79

- Optional live pending deploys: one shared status subscription checks the
  indexer capability, the list and detail pages update over the GraphQL
  WebSocket with an HTTP fallback, and a per-signature watch follows a deploy
  until it is indexed or expires.
- Wallet address page: finalized spendable balance with an exact-value tooltip,
  indexed transfer history with a direction filter and keyset pagination, and
  outgoing pending deploys while tracking is enabled.
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
- Absolute favicon and manifest links for every route, and no missing
  `/favicon.svg` request in the browser console.
- Route-level code splitting: the home page ships with the shell, while charts
  and the syntax highlighter load only on the pages that use them. Removed the
  unused `react-window`, `react-virtualized`, `react-qr-code` and `react-csv`
  dependencies.
- Native controls and scrollbars follow the dark theme (`color-scheme: dark`).
- Transaction pages show the executed fee in ASI
  (`phlo_cost × phlo_price`, using the block's token decimals) plus the phlo
  breakdown and the `phlo_limit` precharge. Pending deploys still have no fee
  until the node reports their executed cost.
- Transaction tabs wrap on narrow screens instead of overflowing the page.

## Frontend-only next

Tracked in
[asi-chain-explorer#83](https://github.com/asi-alliance/asi-chain-explorer/issues/83).

- [ ] Mobile Recent Blocks: sticky Height column, or a card view below 600 px.
- [ ] Loading skeletons and explicit error/retry states for stats, Recent
      Blocks and height summaries.
- [ ] Keep the Home search/filter state in the URL so back/forward and copied
      links restore it.
- [ ] Add a compact status legend to Recent Blocks (Confirmed / Unfinalized).
- [ ] Revisit the home filter row on narrow screens after the mobile table work.

Also planned:

- [ ] Per-page `document.title`; every route currently reports `Explorer`.

## Blocked by the indexer / Hasura

Tracked in
[asi-chain-indexer#66](https://github.com/asi-alliance/asi-chain-indexer/issues/66):

- Exact height counts and grouped-by-height pagination across pages.
- Counts on `/search` type tabs.
- `pg_trgm` indexes and a ranked unified search surface for `%term%` queries.
- Removing the `6+`/`100+` count caps once public aggregates are available.
