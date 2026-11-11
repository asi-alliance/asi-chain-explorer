import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApolloError, useQuery } from '@apollo/client';
import NativeTransferLifecycle, { lifecycleCallLabel, useNativeTransferLifecycle } from './NativeTransferLifecycle';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const DEPLOY = 'deploy-under-review';
const outcome = (overrides: object) => ({
  __typename: 'native_transfer_lifecycle', call_id: 'call', call_index: 0, initiation_block_hash: 'hash-1',
  initiation_block_number: '1', initiation_deploy_id: DEPLOY, from_address: '1111sender', to_address: '1111receiver',
  requested_amount: '1000000000000000000', token_decimals: 18, status: 'pending', result_id: null,
  completion_block_hash: null, completion_block_number: null, completion_deploy_id: null, transfer_id: null,
  ...overrides,
});

const Lifecycle: React.FC = () => <NativeTransferLifecycle lifecycle={useNativeTransferLifecycle(DEPLOY)} />;

function renderLifecycle(result: object) {
  (useQuery as jest.Mock).mockReturnValue({ loading: false, error: undefined, ...result });
  return render(<MemoryRouter><Lifecycle /></MemoryRouter>);
}

const hasuraError = (message: string, code: string) =>
  new ApolloError({ graphQLErrors: [{ message, extensions: { code } }] as any });

const cells = (table: HTMLElement) =>
  within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell'));

test('lists calls started by the deploy with status, exact amount and completion link (issue #71)', () => {
  renderLifecycle({ data: { native_transfer_lifecycle: [
    outcome({ call_id: 'c0', call_index: 0 }),
    outcome({ call_id: 'c1', call_index: 1, status: 'completed', result_id: 'r1', completion_deploy_id: 'deploy-later',
      completion_block_hash: 'hash-2', completion_block_number: '2', transfer_id: '5' }),
    outcome({ call_id: 'c2', call_index: 2, status: 'rejected', result_id: 'r2', requested_amount: '-5' }),
    outcome({ call_id: 'c3', call_index: 3, status: 'coalesced', result_id: 'r1', requested_amount: 'not-a-number' }),
  ] } });

  const rows = cells(screen.getByRole('table', { name: 'Calls started by this deploy' }));
  expect(rows.map((row) => row[4].textContent)).toEqual(['Pending', 'Completed', 'Rejected', 'Coalesced']);
  expect(rows.map((row) => row[3].textContent)).toEqual(['1 ASI', '1 ASI', '-0.000000000000000005 ASI', 'not-a-number']);
  const links = within(rows[1][5]).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/transaction/deploy-later', '/block/hash/hash-2']);
  expect(rows[0][5].textContent).toBe('--');
  expect(screen.queryByRole('table', { name: 'Calls completed by this deploy' })).not.toBeInTheDocument();
});

test('links a completion deploy to the deploy that started the call', () => {
  renderLifecycle({ data: { native_transfer_lifecycle: [
    outcome({ call_id: 'c9', initiation_deploy_id: 'deploy-earlier', initiation_block_hash: 'hash-0',
      initiation_block_number: '0', status: 'completed', result_id: 'r9', completion_deploy_id: DEPLOY }),
  ] } });

  expect(screen.queryByRole('table', { name: 'Calls started by this deploy' })).not.toBeInTheDocument();
  const [row] = cells(screen.getByRole('table', { name: 'Calls completed by this deploy' }));
  expect(within(row[4]).getAllByRole('link').map((link) => link.getAttribute('href')))
    .toEqual(['/transaction/deploy-earlier', '/block/hash/hash-0']);
  expect(row[4].textContent).toContain('#0');
});

test.each([
  ['the indexer does not expose the view', { data: undefined, error: hasuraError(
    "field 'native_transfer_lifecycle' not found in type: 'query_root'", 'validation-failed') }],
  ['the deploy has no calls', { data: { native_transfer_lifecycle: [] } }],
  ['the query is loading', { data: undefined, loading: true }],
])('renders nothing when %s', (_, result) => {
  const { container } = renderLifecycle(result);
  expect(container).toBeEmptyDOMElement();
});

test.each([
  ['a statement timeout', hasuraError('canceling statement due to statement timeout', 'postgres-error')],
  ['a network failure', new ApolloError({ networkError: new Error('Failed to fetch') })],
])('reports %s instead of hiding the section', (_, error) => {
  renderLifecycle({ data: undefined, error });

  expect(screen.getByRole('region', { name: 'Native Transfer Calls' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('not available');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('asks for one row over the limit and marks a truncated list', () => {
  const rows = Array.from({ length: 201 }, (_, i) => outcome({ call_id: `c${i}`, call_index: i }));
  renderLifecycle({ data: { native_transfer_lifecycle: rows } });

  expect(useQuery).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
    variables: { deployId: DEPLOY, limit: 201 },
  }));
  expect(screen.getByRole('note', { name: 'Truncated list' })).toBeInTheDocument();
  expect(cells(screen.getByRole('table', { name: 'Calls started by this deploy' }))).toHaveLength(200);
});

test('does not mark a list that fits the limit', () => {
  renderLifecycle({ data: { native_transfer_lifecycle: [outcome({})] } });
  expect(screen.queryByRole('note', { name: 'Truncated list' })).not.toBeInTheDocument();
});

test('counts distinct calls for the transfers tab label', () => {
  const ready = (rows: object[], truncated = false) => ({
    state: 'ready' as const, initiated: rows as any, completedHere: [], truncated,
  });
  expect(lifecycleCallLabel({ state: 'hidden' })).toBeNull();
  expect(lifecycleCallLabel({ state: 'unavailable', message: 'timeout' })).toBeNull();
  expect(lifecycleCallLabel(ready([outcome({ call_id: 'a' })]))).toBe('1 native call');
  expect(lifecycleCallLabel(ready([outcome({ call_id: 'a' }), outcome({ call_id: 'a', result_id: 'r' }),
    outcome({ call_id: 'b' })]))).toBe('2 native calls');
  expect(lifecycleCallLabel(ready([outcome({ call_id: 'a' })], true))).toBe('1+ native calls');
});
