// Release acceptance matrix for exact amounts and recorded 8/18 decimals (issue #63).
// Each test sends raw HTTP response text through the production Apollo path:
// HttpLink -> JSON.parse -> InMemoryCache amount policies -> mounted view.
// Fixtures are synthetic Hasura responses with HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true,
// not live-chain evidence. docs/release-acceptance/exact-amounts.md records the results.
import React from 'react';
import { ApolloClient, ApolloProvider, InMemoryCache, createHttpLink } from '@apollo/client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TransactionDetailPage from '../pages/TransactionDetailPage';
import BlockDetailPage from '../pages/BlockDetailPage';
import ValidatorsPage from '../pages/ValidatorsPage';
import ValidatorHistoryPage from '../pages/ValidatorHistoryPage';
import { amountTypePolicies } from '../utils/amountPolicies';
import { defaultOptions } from '../apolloDefaults';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});
jest.mock('react-syntax-highlighter', () => ({ Prism: () => null }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ vscDarkPlus: {} }), { virtual: true });

const UINT256_MAX = (2n ** 256n - 1n).toString();
const TWO_POW_53_PLUS_1 = '9007199254740993';
const TEN_POW_19 = '10000000000000000000';
const TWO_POW_63 = '9223372036854775808';
const INT64_MAX = '9223372036854775807'; // phlo_cost, phlo_limit and heights are BIGINT in the indexer.
const SCALE = 77; // transfers.amount_asi is NUMERIC(155,77): Hasura returns 77 fraction digits.

/** PostgreSQL NUMERIC(155,77) text for raw/10^decimals, as Hasura stringifies it. */
function numericText(raw: string, decimals: number): string {
  const digits = raw.padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  return `${whole}.${digits.slice(digits.length - decimals).padEnd(SCALE, '0')}`;
}

type Reply = { status?: number; body: string };
type Responder = (operation: string, variables: Record<string, unknown>) => Reply | undefined;

let requests: Array<{ operation: string; variables: Record<string, unknown> }>;

/** Mounts `element` at `url` with a client whose HTTP responses come from `respond` as raw text. */
function mount(url: string, path: string, element: React.ReactElement, respond: Responder) {
  requests = [];
  const fetchStub = jest.fn(async (_uri: RequestInfo | URL, init?: RequestInit) => {
    const { operationName, variables } = JSON.parse(String(init?.body));
    requests.push({ operation: operationName, variables });
    const reply = respond(operationName, variables) ?? { body: JSON.stringify({ data: emptyData(operationName) }) };
    const status = reply.status ?? 200;
    return new Response(reply.body, { status, headers: { 'content-type': 'application/json' } });
  });
  const client = new ApolloClient({
    link: createHttpLink({ uri: 'https://hasura.example.test/v1/graphql', fetch: fetchStub }),
    cache: new InMemoryCache({ typePolicies: amountTypePolicies }),
    defaultOptions,
  });
  return render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>
    </ApolloProvider>,
  );
}

function emptyData(operation: string): object {
  if (operation === 'GetPendingDeploy') return { pending_deploys: [] };
  return {};
}

const json = (data: object) => ({ body: JSON.stringify({ data }) });

// ---------------------------------------------------------------- deploy details

const DEPLOY_ID = '3045' + 'ab'.repeat(32);
const transfer = (id: string, amount_dust: string, decimals: number) => ({
  __typename: 'transfers', id, from_address: '1111sender', to_address: '1111receiver',
  amount_dust, amount_asi: numericText(amount_dust, decimals), status: 'success', created_at: '2026-11-01T00:00:00',
});
const deployment = (overrides: object = {}) => ({
  __typename: 'deployments', deploy_id: DEPLOY_ID, deployer: '04' + 'cd'.repeat(32), term: 'new x in { Nil }',
  timestamp: '1762000000000', deployment_type: 'ASI Transfer', phlo_cost: INT64_MAX, phlo_price: UINT256_MAX,
  phlo_limit: TWO_POW_53_PLUS_1, valid_after_block_number: '0', status: 'included', block_number: TWO_POW_53_PLUS_1,
  block_hash: 'b'.repeat(64), seq_num: 1, shard_id: 'root', sig: 'ab', sig_algorithm: 'secp256k1',
  errored: false, error_message: null, created_at: '2026-11-01T00:00:00',
  transfers: [
    transfer('1', '1000000000000000001', 18),
    transfer('2', '100000000', 8),
    transfer('3', UINT256_MAX, 18),
    transfer('4', '0', 18),
    transfer('5', '1', 18),
    transfer('6', TWO_POW_63, 18),
    transfer('7', TEN_POW_19, 18),
  ],
  block: null,
  ...overrides,
});

function mountDeploy(respond: Responder) {
  return mount(`/transaction/${DEPLOY_ID}`, '/transaction/:transactionId', <TransactionDetailPage />, respond);
}

test('deploy details keep exact 18-decimal, legacy 8-decimal, zero, smallest, 2^63, 10^19 and uint256 transfers', async () => {
  mountDeploy(op => (op === 'GetTransactionDetails' ? json({ deployments: [deployment()] }) : undefined));
  fireEvent.click(await screen.findByRole('button', { name: /^Transfers/ }));
  // AnimatePresence mode="wait" mounts the tab after the overview exit animation.
  await screen.findByText('Transfer #7', undefined, { timeout: 3000 });

  const amounts = screen.getAllByText(/ ASI$/).map(node => node.textContent);
  expect(amounts).toEqual(expect.arrayContaining([
    '1.000000000000000001 ASI',
    '1 ASI',
    '115792089237316195423570985008687907853269984665640564039457.584007913129639935 ASI',
    '0 ASI',
    '0.000000000000000001 ASI',
    '9.223372036854775808 ASI',
    '10 ASI',
  ]));
  expect(screen.getByText(`Dust: ${UINT256_MAX}`)).toBeInTheDocument();
  expect(screen.getByText('Dust: 1000000000000000001')).toBeInTheDocument();
});

test('deploy details keep exact int64 phlo cost, phlo limit beyond 2^53 and uint256 phlo price', async () => {
  mountDeploy(op => (op === 'GetTransactionDetails' ? json({ deployments: [deployment()] }) : undefined));
  expect(await screen.findByText(INT64_MAX)).toBeInTheDocument();
  expect(screen.getByText(TWO_POW_53_PLUS_1)).toBeInTheDocument();
  expect(screen.getByText(UINT256_MAX)).toBeInTheDocument();
});

test('an HTTP 500 response is an error, not an empty or zero result', async () => {
  mountDeploy(() => ({ status: 500, body: '{"error":"upstream unavailable"}' }));
  expect(await screen.findByText(/Response not successful|status code 500/i)).toBeInTheDocument();
  expect(screen.queryByText(/ ASI$/)).not.toBeInTheDocument();
});

test('an HTTP-200 GraphQL error envelope is an error, not a missing deploy', async () => {
  mountDeploy(op => (op === 'GetTransactionDetails'
    ? { body: JSON.stringify({ errors: [{ message: 'statement timeout' }] }) } : undefined));
  expect(await screen.findByText(/statement timeout/)).toBeInTheDocument();
  expect(screen.queryByText(/ ASI$/)).not.toBeInTheDocument();
});

test.each([
  ['an unsafe JSON number', `"amount_dust":${TWO_POW_53_PLUS_1}`],
  ['exponent notation', '"amount_dust":"1e21"'],
  ['a negative amount', '"amount_dust":"-1"'],
  ['a fraction in a raw amount', '"amount_dust":"1.5"'],
])('a transfer with %s is not displayed as an amount', async (_name, field) => {
  const body = JSON.stringify({ data: { deployments: [deployment({ transfers: [transfer('9', '7', 18)] })] } })
    .replace('"amount_dust":"7"', field);
  mountDeploy(op => (op === 'GetTransactionDetails' ? { body } : undefined));
  await waitFor(() => expect(requests.some(r => r.operation === 'GetTransactionDetails')).toBe(true));
  expect(await screen.findByText(/Unsafe integer from API|Invalid raw amount/)).toBeInTheDocument();
  expect(screen.queryByText(/ ASI$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Dust: /)).not.toBeInTheDocument();
});

// ---------------------------------------------------------------- block and genesis views

const block = (overrides: object = {}) => ({
  __typename: 'blocks', block_number: '0', block_hash: 'a'.repeat(64), parent_links: [], timestamp: '1762000000000',
  proposer: '04' + 'ef'.repeat(32), deployment_count: 1, state_hash: 's', pre_state_hash: 'p', state_root_hash: 'r',
  token_decimals: 18, fault_tolerance: 1, finalization_status: 'finalized', justifications: [], seq_num: 0,
  shard_id: 'root', sig: 'ab', sig_algorithm: 'secp256k1', version: 1, extra_bytes: '', created_at: '2026-11-01T00:00:00',
  bonds_map: [
    { validator: 'validator-a', stake: '1000000000000000001' },
    { validator: 'validator-b', stake: UINT256_MAX },
    { validator: 'validator-c', stake: '0' },
  ],
  deployments: [{ ...deployment(), __typename: 'deployments', block_number: '0', transfers: [] }],
  ...overrides,
});

function bondStakes(): string[] {
  const table = screen.getByRole('heading', { name: 'Validator Bonds Map' }).closest('section') as HTMLElement;
  return within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[1].textContent ?? '');
}

test('genesis block bonds use the recorded 18 decimals exactly', async () => {
  mount('/block/0', '/block/:blockNumber', <BlockDetailPage />,
    op => (op === 'GetBlocksAtHeight' ? json({ blocks: [block()] }) : undefined));
  await screen.findByRole('heading', { name: 'Validator Bonds Map' });
  expect(bondStakes()).toEqual([
    '1.000000000000000001 ASI',
    '115792089237316195423570985008687907853269984665640564039457.584007913129639935 ASI',
    '0 ASI',
  ]);
});

test('a historical 8-decimal block keeps its recorded precision', async () => {
  mount('/block/12', '/block/:blockNumber', <BlockDetailPage />, op => (op === 'GetBlocksAtHeight'
    ? json({ blocks: [block({ block_number: '12', token_decimals: 8, bonds_map: [{ validator: 'v', stake: '100000000' }] })] })
    : undefined));
  await screen.findByRole('heading', { name: 'Validator Bonds Map' });
  expect(bondStakes()).toEqual(['1 ASI']);
});

test('a block height beyond 2^53 is requested exactly', async () => {
  mount(`/block/${TWO_POW_53_PLUS_1}`, '/block/:blockNumber', <BlockDetailPage />,
    op => (op === 'GetBlocksAtHeight' ? json({ blocks: [] }) : undefined));
  await screen.findByText(/Block Not Found/);
  expect(requests.find(r => r.operation === 'GetBlocksAtHeight')?.variables).toEqual({ blockNumber: TWO_POW_53_PLUS_1 });
});

// ---------------------------------------------------------------- validators

const KEY = '04' + 'ab'.repeat(40);
const validatorsData = (bonds: object[]) => ({
  validators: [{ __typename: 'validators', public_key: KEY, name: null, status: 'active', total_stake: '0',
    token_decimals: 18, first_seen_block: '0', last_seen_block: '100', created_at: '', updated_at: '' }],
  validator_bonds: bonds.map(b => ({ __typename: 'validator_bonds', validator_public_key: KEY, ...b })),
  blocks: [],
});

function validatorRow(): string[] {
  const [row] = screen.getAllByRole('row').slice(1);
  return within(row).getAllByRole('cell').map(cell => cell.textContent ?? '');
}

test('validators select the bond at string height 100 over 99 and show its exact stake', async () => {
  mount('/validators', '/validators', <ValidatorsPage />, op => (op === 'GetActiveValidators' ? json(validatorsData([
    { block_number: '100', stake: '1000000000000000000', token_decimals: 18 },
    { block_number: '99', stake: '2000000000000000000', token_decimals: 18 },
  ])) : undefined));
  await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
  const row = validatorRow();
  expect(row[1]).toBe('1');
  expect(row[6]).toBe('#100');
});

test.each([
  ['2^63', TWO_POW_63, 18, '9.223372036854775808'],
  ['10^19', TEN_POW_19, 18, '10'],
  ['uint256 maximum', UINT256_MAX, 18, '115792089237316195423570985008687907853269984665640564039457.584007913129639935'],
  ['legacy 8 decimals', '100000000', 8, '1'],
])('validators show a %s stake exactly', async (_name, stake, token_decimals, shown) => {
  mount('/validators', '/validators', <ValidatorsPage />, op => (op === 'GetActiveValidators'
    ? json(validatorsData([{ block_number: '100', stake, token_decimals }])) : undefined));
  await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
  expect(validatorRow()[1]).toBe(shown);
});

test('an unsafe JSON stake is rejected, not rounded', async () => {
  const body = JSON.stringify({ data: validatorsData([{ block_number: '100', stake: 'STAKE', token_decimals: 18 }]) })
    .replace('"STAKE"', TWO_POW_53_PLUS_1);
  mount('/validators', '/validators', <ValidatorsPage />, op => (op === 'GetActiveValidators' ? { body } : undefined));
  expect(await screen.findByText(/Unsafe integer from API/)).toBeInTheDocument();
  expect(screen.queryByText('0.000000000000000009')).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain('9007199254740992');
});

// ---------------------------------------------------------------- validator history

test('validator history requests an exact height beyond 2^53', async () => {
  const latest = '9007199254740995';
  mount('/validator-history', '/validator-history', <ValidatorHistoryPage />, (op, variables) => {
    if (op === 'GetBlockRange') return json({ blocks: [{ __typename: 'blocks', block_hash: 'h', block_number: latest }] });
    if (op === 'GetValidatorHistory') return json({ blocks: [{ __typename: 'blocks', block_number: variables.blockNumber,
      timestamp: '1762000000000', block_hash: 'h', proposer: 'p', validator_bonds: [{ __typename: 'validator_bonds',
        id: 1, block_hash: 'h', block_number: variables.blockNumber, stake: '1000000000000000001', token_decimals: 18,
        validator_public_key: KEY }] }] });
    return undefined;
  });
  await screen.findByRole('cell', { name: '1.000000000000000001 ASI' });
  expect(requests.filter(r => r.operation === 'GetValidatorHistory')[0].variables).toEqual({ blockNumber: latest });

  fireEvent.change(screen.getByLabelText('Block:'), { target: { value: TWO_POW_53_PLUS_1 } });
  await waitFor(() => expect(requests.filter(r => r.operation === 'GetValidatorHistory')).toHaveLength(2));
  expect(requests.filter(r => r.operation === 'GetValidatorHistory')[1].variables).toEqual({ blockNumber: TWO_POW_53_PLUS_1 });
});
