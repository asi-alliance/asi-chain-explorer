import React from 'react';
import { PendingDeploysStatusProvider } from '../hooks/usePendingDeploysStatus';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PendingDeploysPanel from './PendingDeploysPanel';
import { mockOperations, pendingStatusRows } from '../testing/apolloOperations';
import type { OperationResult } from '../testing/apolloOperations';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useSubscription: jest.fn(),
}));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const SIG = '3045022100' + 'ab'.repeat(30);
const deploy = (overrides: object = {}) => ({
  __typename: 'pending_deploys', sig: SIG, deployer: '04' + 'cd'.repeat(32), deployer_address: '1111' + 'x'.repeat(50),
  timestamp: String(Date.now() - 60_000), phlo_price: '1', phlo_limit: '500000', valid_after_block_number: '0',
  shard_id: 'root', expiration_timestamp: '0', is_rejected: false, fetched_at: new Date().toISOString(),
  included_deployment: null, ...overrides,
});

interface Results {
  status?: OperationResult;
  list?: OperationResult;
  statusFallback?: OperationResult;
  listFallback?: OperationResult;
}

function renderPanel({ status, list, statusFallback, listFallback }: Results) {
  const requested = mockOperations({
    WatchPendingDeploysStatus: () => status ?? { data: { indexer_state: pendingStatusRows() } },
    WatchPendingDeploys: () => list ?? { data: { pending_deploys: [] } },
    GetPendingDeploysStatus: () => statusFallback ?? {},
    GetPendingDeploys: () => listFallback ?? {},
  });
  const panel = () => <MemoryRouter><PendingDeploysStatusProvider><PendingDeploysPanel /></PendingDeploysStatusProvider></MemoryRouter>;
  const { rerender } = render(panel());
  return { requested, refresh: () => rerender(panel()) };
}

const rows = () => within(screen.getByRole('table', { name: 'Pending Deploys' }))
  .getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell'));

test('lists pending deploys with links and their buffer status (issue #70)', () => {
  const { requested } = renderPanel({
    status: { data: { indexer_state: pendingStatusRows({ count: 3, total_available: 3 }) } },
    list: { data: { pending_deploys: [
      deploy(),
      deploy({ sig: SIG + '01', is_rejected: true }),
      deploy({ sig: SIG + '02', included_deployment: { __typename: 'deployments', deploy_id: SIG + '02', block_number: '42', block_hash: 'aa' } }),
    ] } },
  });

  expect(screen.getByLabelText('Pending deploy count')).toHaveTextContent('3');
  const cells = rows();
  expect(cells).toHaveLength(3);
  expect(within(cells[0][0]).getByRole('link')).toHaveAttribute('href', `/transaction/${SIG}`);
  expect(cells.map((row) => row[5].textContent)).toEqual(['Pending', 'Retrying after rejection', 'Included in block #42']);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(screen.getByText(/3 validators/)).toHaveTextContent('Updates live.');
  // Only subscriptions while the WebSocket works: no HTTP requests.
  expect(new Set(requested)).toEqual(new Set(['WatchPendingDeploys', 'WatchPendingDeploysStatus']));
});

test('states when the node responses truncated the pending list', () => {
  renderPanel({
    status: { data: { indexer_state: pendingStatusRows({ count: 1000, total_available: 1500 }) } },
    list: { data: { pending_deploys: [deploy()] } },
  });

  expect(screen.getByRole('note')).toHaveTextContent('Each validator returns at most 1000 entries');
  expect(screen.getByRole('note')).toHaveTextContent('1500');
  expect(screen.getByText(/Showing the latest 1 of 1000/)).toBeInTheDocument();
  expect(rows()).toHaveLength(1);
});

test('fades a removed row and finishes the last exit before showing the empty queue', async () => {
  const remaining = deploy({ sig: SIG + '01' });
  const list = { data: { pending_deploys: [deploy(), remaining] } };
  const { refresh } = renderPanel({ list });
  list.data = { pending_deploys: [remaining] };
  refresh();
  expect(screen.getByTitle(SIG)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTitle(SIG)).not.toBeInTheDocument());
  expect(screen.getByTitle(remaining.sig)).toBeInTheDocument();

  list.data = { pending_deploys: [] };
  refresh();
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.queryByText('No deploys are waiting for a block.')).not.toBeInTheDocument();
  expect(await screen.findByText('No deploys are waiting for a block.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('shows an empty state without a table', () => {
  renderPanel({});

  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByText('No deploys are waiting for a block.')).toBeInTheDocument();
  expect(screen.getByLabelText('Pending deploy count')).toHaveTextContent('0');
});

test('keeps the latest snapshot when the queue refills during its exit', async () => {
  const list = { data: { pending_deploys: [deploy()] } };
  const { refresh } = renderPanel({ list });
  list.data = { pending_deploys: [] };
  refresh();
  const next = deploy({ sig: SIG + '01' });
  list.data = { pending_deploys: [next] };
  refresh();
  await waitFor(() => expect(screen.queryByTitle(SIG)).not.toBeInTheDocument());
  expect(screen.getByTitle(next.sig)).toBeInTheDocument();
  expect(screen.queryByText('No deploys are waiting for a block.')).not.toBeInTheDocument();
});

test('says that the indexer does not track pending deploys instead of showing an empty queue', () => {
  const { requested } = renderPanel({ status: { data: { indexer_state: [] } } });

  expect(screen.getByRole('status')).toHaveTextContent('does not track pending deploys');
  expect(screen.queryByText('No deploys are waiting for a block.')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Pending deploy count')).not.toBeInTheDocument();
  expect(requested).not.toContain('WatchPendingDeploys');
});

test('reports a failed query instead of an empty list', () => {
  renderPanel({
    list: { error: new Error('closed') },
    listFallback: { error: new Error('field "pending_deploys" not found') },
  });

  expect(screen.getByRole('alert')).toHaveTextContent('not available');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Pending deploy count')).not.toBeInTheDocument();
});

test('polls over HTTP when live updates fail', () => {
  const { requested } = renderPanel({
    list: { error: new Error('WebSocket closed') },
    listFallback: { data: { pending_deploys: [deploy()] } },
  });

  expect(rows()).toHaveLength(1);
  expect(screen.getByText(/refreshes every 5 seconds/)).toBeInTheDocument();
  expect(requested).toContain('GetPendingDeploys');
});

test('warns when the indexer stopped refreshing the pending deploys', () => {
  renderPanel({
    status: { data: { indexer_state: pendingStatusRows({ count: 1 }, new Date(Date.now() - 10 * 60_000)) } },
    list: { data: { pending_deploys: [deploy()] } },
  });

  expect(screen.getByRole('note', { name: 'Stale snapshot' })).toBeInTheDocument();
  expect(rows()).toHaveLength(1);
});

test('warns when some validators cannot be read', () => {
  renderPanel({ status: { data: { indexer_state: pendingStatusRows({ reachable: 2 }) } } });

  expect(screen.getByRole('note', { name: 'Unreachable validators' })).toHaveTextContent('1 of 3 validators');
});
