# Exact amounts and recorded 8/18 decimals: release acceptance

This record tracks the acceptance matrix of issue #63. It covers the explorer
side only. A row is **passed** only for the revision and the evidence type that
it names. Fixture results are not live-chain evidence.

## Revisions

| Component | Revision | Notes |
|---|---|---|
| Explorer | `dev` at `69af4e5`, plus the change that adds this record | Includes #58 (exact amounts) and #64 (#61, #62 and GraphQL errors) |
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

## Matrix

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Record exact revisions, schema and native precision | Partial | Table above. Node, Hasura metadata and network precision are not selected |
| 2 | Raw integers and SQL values through GraphQL, views and exports, without floating point | Passed (fixtures) | `src/acceptance/exactAmounts.test.tsx` sends raw HTTP text through `HttpLink`, `JSON.parse`, the amount type policies and the mounted views. `RecentDataExporter.test.tsx` covers CSV export. No SQL or live GraphQL comparison was run |
| 3 | `1000000000000000001` at 18 shows `1.000000000000000001`. `100000000` at 8 shows `1` | Passed (fixtures) | Deploy transfers, genesis bonds, a historical 8-decimal block, validators, validator history, CSV export |
| 4 | 0, small values, 2^53+1, 10^19, 2^63, uint256 maximum | Passed (fixtures) | Transfers and stakes: 0, 1, 10^18+1, 2^63, 10^19, uint256 maximum. Phlo price: uint256 maximum. Phlo cost: int64 maximum. Phlo limit and heights: 2^53+1 |
| 5 | Transfers, current and historical stakes, genesis and block views, phlo, sorting and filtering, details, exports | Passed (fixtures), with one fix | Bond selection at 99/100 with string heights. Header-search variables are in `AdvancedSearch.test.tsx`. **Fix:** the validator-history block input used `parseInt` and requested `9007199254740992` for `9007199254740993`. It now keeps the exact height |
| 6 | Malformed strings, unsafe JSON numbers, HTTP failures, GraphQL error envelopes | Passed (fixtures) | An unsafe JSON number, `1e21`, `-1` and `1.5` in a raw amount show an error and no amount. HTTP 500 and HTTP-200 `errors` show an error. Neither becomes a zero or an empty result |
| 7 | #58/#59 combined balance path | Not applicable | `WalletSearch` is not mounted in this build. #59 is not merged |
| 8 | Test commands and results at the final heads, fresh browser and served-asset evidence | Partial | Commands and results below. No browser or served-asset evidence for a release |

Issue #63 stays open until a selected release passes rows 1, 2 and 8 with live
evidence.

## Commands and results

Local run on the branch that adds this record. Node 18.19.1. CI uses Node 22.

| Command | Result |
|---|---|
| `CI=true npx react-scripts test --watchAll=false src/acceptance` | 18 tests passed |
| `CI=true npx react-scripts test --watchAll=false --runInBand` | 23 suites, 175 tests passed |
| `npx tsc --noEmit` | Passed |
| `CI=true npm run build` | Passed. Only the existing `waf-captcha-frontend` source-map warnings |

Before the validator-history fix, `validator history requests an exact height
beyond 2^53` failed: the request had `blockNumber: 9007199254740992`.

## Not run

- A live node, indexer and Hasura stack, and SQL-to-GraphQL comparison.
- Browser and served-asset checks of a deployed release.
- Node #896, node #947 and indexer #22 combinations.
