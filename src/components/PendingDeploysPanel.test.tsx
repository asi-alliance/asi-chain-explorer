import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import PendingDeploysPanel from './PendingDeploysPanel';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
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

function renderPanel(result: object) {
  (useQuery as jest.Mock).mockReturnValue({ loading: false, error: undefined, ...result });
  render(<MemoryRouter><PendingDeploysPanel /></MemoryRouter>);
}

const rows = () => within(screen.getByRole('table', { name: 'Pending Deploys' }))
  .getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell'));

test('lists pending deploys with links and their buffer status (issue #70)', () => {
  renderPanel({ data: {
    pending_deploys: [
      deploy(),
      deploy({ sig: SIG + '01', is_rejected: true }),
      deploy({ sig: SIG + '02', included_deployment: { __typename: 'deployments', deploy_id: SIG + '02', block_number: '42', block_hash: 'aa' } }),
    ],
    pending_deploys_aggregate: { aggregate: { count: 3 } },
    indexer_state: [{ key: 'pending_deploys_total_available', value: '3' }],
  } });

  expect(screen.getByLabelText('Pending deploy count')).toHaveTextContent('3');
  const cells = rows();
  expect(cells).toHaveLength(3);
  expect(within(cells[0][0]).getByRole('link')).toHaveAttribute('href', `/transaction/${SIG}`);
  expect(cells.map((row) => row[5].textContent)).toEqual(['Pending', 'Retrying after rejection', 'Included in block #42']);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test('states when the node response truncated the pending list', () => {
  renderPanel({ data: {
    pending_deploys: [deploy()],
    pending_deploys_aggregate: { aggregate: { count: 1000 } },
    indexer_state: [{ key: 'pending_deploys_total_available', value: '1500' }],
  } });

  expect(screen.getByRole('note')).toHaveTextContent('1500');
  expect(rows()).toHaveLength(1);
});

test('shows an empty state without a table', () => {
  renderPanel({ data: { pending_deploys: [], pending_deploys_aggregate: { aggregate: { count: 0 } }, indexer_state: [] } });

  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Pending deploy count')).toHaveTextContent('0');
});

test('reports a failed query instead of an empty list', () => {
  renderPanel({ data: undefined, error: new Error('field "pending_deploys" not found') });

  expect(screen.getByRole('status')).toHaveTextContent('not available');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Pending deploy count')).not.toBeInTheDocument();
});

test('warns when the indexer stopped refreshing the snapshot', () => {
  renderPanel({ data: {
    pending_deploys: [deploy({ fetched_at: new Date(Date.now() - 10 * 60_000).toISOString() })],
    pending_deploys_aggregate: { aggregate: { count: 1 } },
    indexer_state: [{ key: 'pending_deploys_total_available', value: '1' }],
  } });

  expect(screen.getByRole('note', { name: 'Stale snapshot' })).toBeInTheDocument();
  expect(rows()).toHaveLength(1);
});
