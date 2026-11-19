# Exact amounts and recorded 8/18 decimals: release acceptance

This record tracks the acceptance matrix of issue #63. It covers the explorer
side only. A row is **passed** only for the revision and the evidence type that
it names. Fixture results are not live-chain evidence. A row that needs live
evidence stays **partial** until that evidence exists.

## Revisions

| Component | Revision | Notes |
|---|---|---|
| Explorer | `dev` at `69af4e5`, plus the change that adds this record | Includes #58 (exact amounts) and #64 (#61, #62 and GraphQL errors). Record the `dev` merge commit of this change after it merges |
| Indexer schema | `asi-chain-indexer` `dev` at `99aef72` | Migrations 000 to 006. The fixtures follow this contract (see below) |
| Hasura | Not run | Fixtures assume `HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true` |
| Node | Not selected | The node #896 profile, node #947 and indexer #22 are not part of this run |
| Images | None | No image was built or deployed for this record |

Producer contract at indexer `99aef72`. The fixtures do not assert more than this contract:

- `transfers.amount_dust`, `validators.total_stake`, `validator_bonds.stake`, `deployments.phlo_price` and `pending_deploys.phlo_price` are `NUMERIC(78,0)` with a uint256 check.
- `transfers.amount_asi` is `NUMERIC(155,77)`. Hasura returns 77 fraction digits.
- `phlo_cost`, `phlo_limit` and block heights stay `BIGINT`. The fixtures use at most the int64 maximum for them.
- `blocks.bonds_map` stores each stake as a JSON string (migration 001).
- `token_decimals` is recorded on blocks, transfers, validators and bonds (0 to 77).

## Evidence types

- **Acceptance fixture:** `src/acceptance/exactAmounts.test.tsx`. Raw HTTP response text goes through `HttpLink`, `JSON.parse`, the amount type policies and the mounted view.
- **Unit test:** an older test that mocks `useQuery` or the data source. It does not exercise the HTTP, JSON or cache path.
- **Live:** a selected release against a node, indexer and Hasura stack, with a browser. None in this record.

## Matrix

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Record exact revisions, schema and native precision | Partial | Table above. Node, Hasura metadata and network precision are not selected |
| 2 | Raw integers and SQL values through GraphQL, views and exports, without floating point | Partial | Acceptance fixture: passed for the views in row 5. Exports: unit test only. No SQL-to-GraphQL comparison and no live GraphQL response |
| 3 | `1000000000000000001` at 18 shows `1.000000000000000001`. `100000000` at 8 shows `1` | Passed (fixtures) | Acceptance fixture: deploy transfers, genesis bonds, a historical 8-decimal block, validators, validator history. Unit test: CSV export |
| 4 | 0, small values, 2^53+1, 10^19, 2^63, uint256 maximum | Passed (fixtures) | Transfers and stakes: 0, 1, 10^18+1, 2^63, 10^19, uint256 maximum. Phlo price: uint256 maximum. Phlo cost: int64 maximum. Phlo limit and heights: 2^53+1 |
| 5 | Transfers, stakes, genesis and block views, phlo, sorting and filtering, details, exports | Partial | See the row 5 breakdown below |
| 6 | Malformed strings, unsafe JSON numbers, HTTP failures, GraphQL error envelopes | Partial | Acceptance fixture: passed for the views listed in the row 6 breakdown. Exports, the transfers list and search have no failure fixture |
| 7 | #58/#59 combined balance path | Not applicable | `WalletSearch` is not mounted in this build. #59 is not merged |
| 8 | Test commands and results at the final heads, fresh browser and served-asset evidence | Partial | Commands and results below. No browser or served-asset evidence for a release |

Issue #63 stays open until a selected release passes rows 1, 2 and 8 with live
evidence.

### Row 5 breakdown

| View or function | Status | Evidence |
|---|---|---|
| Deploy details: transfers and dust | Passed (fixtures) | Acceptance fixture. All seven transfers in their order |
| Deploy details: phlo cost, limit and price | Passed (fixtures) | Acceptance fixture |
| Genesis and block bonds, historical 8-decimal block | Passed (fixtures) | Acceptance fixture |
| Block lookup by a height beyond 2^53 | Passed (fixtures) | Acceptance fixture |
| Current stakes (validators) | Passed (fixtures) | Acceptance fixture. Bond selection at string heights 99/100 |
| Historical stakes (validator history) | Passed (fixtures), with two fixes | Acceptance fixture. See "Fixes" |
| Header search with exact heights | Unit test only | `AdvancedSearch.test.tsx` checks the query variables |
| CSV export | Unit test only | `RecentDataExporter.test.tsx` |
| Transfers list, search results, pending deploys | Unit test only | `TransfersPage.test.tsx`, `SearchResultsPage.test.tsx`, `PendingPage.test.tsx` |
| Sorting and filtering of amounts | Not covered | No test sorts or filters by an amount |

### Row 6 breakdown

| View | HTTP 500 | HTTP-200 `errors` | Malformed or unsafe amount |
|---|---|---|---|
| Deploy details | Passed (fixtures) | Passed (fixtures) | Passed (fixtures): unsafe JSON number, `1e21`, `-1`, `1.5` |
| Block view | Passed (fixtures) | Passed (fixtures) | Not covered |
| Validators | Passed (fixtures) | Passed (fixtures) | Passed (fixtures): unsafe JSON number |
| Validator history, latest-block query | Passed (fixtures) | Passed (fixtures) | Passed (fixtures): invalid latest height |
| Exports, transfers list, search | Not covered | Not covered | Not covered |

In each passed case the view shows an error. It shows no amount, no empty result
and no block `#0`.

## Fixes

The acceptance fixtures found two defects in validator history. This change
fixes both:

- The block input used `parseInt` and requested `9007199254740992` for
  `9007199254740993`. The page now keeps the exact decimal string.
- A failed, empty or invalid latest-block response became block `#0`, with the
  text "No validator data available for block #0". The page now shows the error
  and does not request a snapshot.

Validator history shows heights with separators again (`#9,007,199,254,740,993`).
The block card shows the height that the response returned, not the requested
height.

## Commands and results

Local run on the branch that adds this record. Node 18.19.1. CI uses Node 22.
`package-lock.json` is in `.gitignore`, so a local run does not pin the
dependency resolution. The CI run of each head is the reproducible anchor.

| Command | Result |
|---|---|
| `CI=true npx react-scripts test --watchAll=false src/acceptance` | 26 tests passed |
| `CI=true npx react-scripts test --watchAll=false --runInBand` | 23 suites, 183 tests passed |
| `npx tsc --noEmit` | Passed |
| `CI=true npm run build` | Passed. Only the existing `waf-captcha-frontend` source-map warnings |

CI runs:

- First head `76c9b39`: `Tests` run [43203577531](https://github.com/asi-alliance/asi-chain-explorer/actions/runs/43203577531), 23 suites and 175 tests.
- Later heads: the `Tests` check of the pull request. A record cannot name the CI run of its own commit.

Negative controls: with the page before the fixes, the exact-height test and the
four latest-block failure tests fail. Before the first fix, the request had
`blockNumber: 9007199254740992`.

## Not run

- A live node, indexer and Hasura stack, and SQL-to-GraphQL comparison.
- Browser and served-asset checks of a deployed release.
- Node #896, node #947 and indexer #22 combinations.
