# Explorer roadmap

Current focus: PR #84 carries the frontend polish tracked in
[asi-chain-explorer#83](https://github.com/asi-alliance/asi-chain-explorer/issues/83).
This file records what PR #79 and PR #84 ship and what remains;
backend-dependent scope lives in
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
  finalized/unfinalized filtering, parent/child counts and block-hash rows
  (moved to `/height/{height}` in #84).
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
- Relative times read `just now` below 20 seconds and `a minute ago` below a
  minute, then fall back to date-fns. Absolute timestamps use the browser's
  local timezone and include its zone.
- Deployments in block 0 are labelled `Genesis`; their original RChain mainnet
  timestamp is available on hover instead of reading as the testnet's age.
- Transaction details keep one transaction ID with its copy action; the
  inclusion banner is replaced by a compact status icon whose tooltip explains
  the state, and an identical Signature box is no longer repeated.
- The transaction list uses one tab row with icons and counts plus a total;
  the duplicate summary bar is gone.
- CSV export is a labeled `Export CSV` action in the table footer for blocks,
  deployments and transfers, with an entity-specific accessible name and the
  existing filenames.
- Home search and finalized-only filters, the `/transactions` tab and
  transaction detail tabs are URL-backed and survive copy/share.
- Below 600 px the Recent Blocks Height column stays pinned while the table
  scrolls horizontally.
- Every route sets a descriptive browser title; unknown paths report
  `Page not found`.
- The `/search` Transfers tab restores filter-only ASI amount ranges.
- Source and Docker fallback precision is 18; historical rows keep their own `token_decimals`.
- Removed unused QR, Swagger, XLSX, Workbox and intersection-observer packages, updated the syntax highlighter and pinned nginx stable.
- Transaction tabs wrap on narrow screens instead of overflowing the page.

## After PR #79

- A positive wallet balance below the eight-decimal display precision reads
  `<0.00000001 ASI`; the exact amount stays in the hover/focus tooltip and the
  accessible description. A dotted underline marks a truncated balance.
- Live Activity identifies DAG sibling blocks by hash, so blocks at one height
  no longer share a React key or read as duplicate rows.
- A single search match reads `Showing 1 result`; later pages keep the absolute
  result position.
- The DAG height overview moved to `/height/{height}`; legacy `/block/{number}`
  links redirect there and keep the `?status=` filter.

## Shipped in PR #84

Tracked in
[asi-chain-explorer#83](https://github.com/asi-alliance/asi-chain-explorer/issues/83).

- [x] Loading skeletons for stats, Recent Blocks and height summaries.
- [x] Explicit error and Retry states that keep the last loaded data visible.
- [x] Confirmed / Unfinalized status legend under the Recent Blocks filters.
- [x] Home search and filter controls stack at 600 px with no overflow at 390 px.
- [x] Finalized only is checked by default; `?finalized=0` explicitly shows all
      blocks.
- [x] Recent Blocks rows have no hover tint, because the rows are not clickable;
      links keep their own hover affordance and green stays reserved for the
      Confirmed status.
- [x] Validator proposers in Recent Blocks link to the Validators page.
- [x] `/height/:height` always shows the height overview, including a single
      sibling, with singular `1 sibling block` copy.
- [x] Live Activity shows skeleton rows while its three initial queries load.

## Blocked by the indexer / Hasura

Tracked in
[asi-chain-indexer#66](https://github.com/asi-alliance/asi-chain-indexer/issues/66):

- Exact height counts and grouped-by-height pagination across pages.
- Counts on `/search` type tabs.
- `pg_trgm` indexes and a ranked unified search surface for `%term%` queries.
- Removing the `6+`/`100+` count caps once public aggregates are available.
