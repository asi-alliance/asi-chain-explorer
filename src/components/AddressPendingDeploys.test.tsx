import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSubscription } from '@apollo/client';
import AddressPendingDeploys, { ADDRESS_PENDING_LIMIT } from './AddressPendingDeploys';
import { mockOperations, operationName } from '../testing/apolloOperations';
import { usePendingDeploysStatus } from '../hooks/usePendingDeploysStatus';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});
jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useSubscription: jest.fn(),
}));
jest.mock('../hooks/usePendingDeploysStatus', () => ({ usePendingDeploysStatus: jest.fn() }));

const address = '11112HCvTdobZGUsaSKBLRSh6XW4kY3RNQFeKj4VMqXxHz2AYS2LyH';
const hash = 'ab'.repeat(32);

const tracking = {
  status: {
    nodes: 3, reachable: 3, count: 2, totalAvailable: 2, intervalMs: 1000, updatedAt: new Date(),
  },
  loading: false,
  error: undefined,
  live: true,
};

function deploy(index: number, overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'pending_deploys',
    sig: String(index + 1).repeat(130),
    deployer: '04' + 'cd'.repeat(32),
    deployer_address: address,
    timestamp: String(1762770000000 + index),
    phlo_limit: '500000',
    phlo_price: '1',
    valid_after_block_number: '34170',
    shard_id: 'root',
    expiration_timestamp: '0',
    is_rejected: false,
    fetched_at: '2026-11-23T00:00:00',
    included_deployment: null,
    ...overrides,
  };
}

function show(count = 0, overrides: Record<string, unknown> = {}) {
  const rows = Array.from({ length: count }, (_, index) => deploy(index, overrides));
  const requested = mockOperations({
    WatchAddressPendingDeploys: () => ({ data: { pending_deploys: rows } }),
  });
  (usePendingDeploysStatus as jest.Mock).mockReturnValue(tracking);
  const result = render(<MemoryRouter><AddressPendingDeploys address={address} /></MemoryRouter>);
  return { ...result, requested, rows };
}

beforeEach(() => {
  (usePendingDeploysStatus as jest.Mock).mockReturnValue(tracking);
});

test.each([1, 2])('lists %i pending deploys submitted by the address', count => {
  const { requested, rows } = show(count);

  expect(screen.getByRole('heading', { name: 'Pending deploys' })).toBeInTheDocument();
  expect(screen.getByLabelText('Pending deploy count')).toHaveTextContent(String(count));
  const links = screen.getAllByRole('link')
    .filter(link => link.getAttribute('href')?.startsWith('/transaction/'));
  expect(links).toHaveLength(count);
  links.forEach((link, index) => {
    expect(link).toHaveAttribute('href', `/transaction/${encodeURIComponent(rows[index].sig)}`);
  });
  expect(requested).toContain('WatchAddressPendingDeploys');

  const call = (useSubscription as jest.Mock).mock.calls
    .find(([document]) => operationName(document) === 'WatchAddressPendingDeploys');
  expect(call[1]).toEqual(expect.objectContaining({
    variables: { address, limit: ADDRESS_PENDING_LIMIT }, skip: false,
  }));
});

test('shows a deploy that the node is retrying after rejection', () => {
  show(1, { is_rejected: true });
  expect(screen.getByText('Retrying after rejection')).toBeInTheDocument();
});

test('shows an included deploy with its block link', () => {
  show(1, {
    included_deployment: { deploy_id: 'a'.repeat(130), block_number: '34168', block_hash: hash },
  });
  expect(screen.getByText('Included')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '#34168' }))
    .toHaveAttribute('href', '/block/hash/' + hash);
});

test('notes when the address has more than the visible limit', () => {
  show(ADDRESS_PENDING_LIMIT);
  expect(screen.getByText(`Showing the latest ${ADDRESS_PENDING_LIMIT} pending deploys.`)).toBeInTheDocument();
});

test('renders nothing while the indexer does not track pending deploys', () => {
  (usePendingDeploysStatus as jest.Mock).mockReturnValue({
    status: null, loading: false, error: undefined, live: false,
  });
  const requested = mockOperations({});
  const { container } = render(<MemoryRouter><AddressPendingDeploys address={address} /></MemoryRouter>);

  expect(container).toBeEmptyDOMElement();
  expect(requested).not.toContain('WatchAddressPendingDeploys');
});

test('renders nothing when this address has no pending deploys', () => {
  const { container } = show(0);
  expect(container).toBeEmptyDOMElement();
});

test('reports an unavailable pending list when both transports fail', () => {
  mockOperations({
    WatchAddressPendingDeploys: () => ({ error: new Error('WebSocket closed') }),
    GetAddressPendingDeploys: () => ({ error: new Error('HTTP unavailable') }),
  });
  render(<MemoryRouter><AddressPendingDeploys address={address} /></MemoryRouter>);

  expect(screen.getByRole('alert')).toHaveTextContent('Pending deploys are unavailable.');
});
