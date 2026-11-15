import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSubscription } from '@apollo/client';
import TransactionDetailPage from './TransactionDetailPage';
import { mockOperations, operationName, pendingStatusRows } from '../testing/apolloOperations';
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
jest.mock('react-syntax-highlighter', () => ({ Prism: () => null }));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ vscDarkPlus: {} }), { virtual: true });

const SIG = '3045022100' + 'ef'.repeat(30);
const pending = {
  __typename: 'pending_deploys', sig: SIG, deployer: '04' + 'cd'.repeat(32), deployer_address: '1111pendingdeployer',
  term: 'new x in { x!(1) }', timestamp: '1762770000000', phlo_price: '1', phlo_limit: '500000',
  valid_after_block_number: '12', shard_id: 'root', expiration_timestamp: '0', is_rejected: false,
  fetched_at: '2026-11-11T00:00:00', included_deployment: null,
};

interface Lookup {
  pending?: OperationResult;
  indexed?: OperationResult;
  status?: OperationResult;
  enabled?: boolean;
}

let state: Lookup = {};

function renderLookup(initial: Lookup) {
  state = initial;
  const refetch = jest.fn();
  const statusData = () => (state.status ?? { data: { indexer_state: pendingStatusRows() } });
  const requested = mockOperations({
    GetTransactionDetails: () => ({ data: { deployments: [] }, refetch }),
    GetPendingDeploysStatus: () =>
      state.enabled === false ? { data: { indexer_state: [] } } : statusData(),
    WatchPendingDeploysStatus: statusData,
    WatchPendingDeploy: () => state.pending ?? { data: { pending_deploys: [] } },
    WatchDeploymentIndexed: () => state.indexed ?? { data: { deployments: [] } },
  });
  const page = () => (
    <MemoryRouter initialEntries={[`/transaction/${SIG}`]}>
      <Routes><Route path="/transaction/:transactionId" element={<TransactionDetailPage />} /></Routes>
    </MemoryRouter>
  );
  const { rerender } = render(page());
  const update = (next: Lookup) => {
    state = { ...state, ...next };
    rerender(page());
  };
  return { refetch, update, requested };
}

afterEach(() => jest.useRealTimers());

test('shows a pending deploy instead of "not found" and reloads when the deploy is indexed (issue #70)', () => {
  const { refetch, update } = renderLookup({ pending: { data: { pending_deploys: [pending] } } });

  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(screen.getByText(SIG)).toBeInTheDocument();
  expect(screen.getByText('#12')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();
  expect(refetch).not.toHaveBeenCalled();

  update({ indexed: { data: { deployments: [{ __typename: 'deployments', deploy_id: SIG }] } } });
  expect(refetch).toHaveBeenCalledTimes(1);
});

test('subscribes to the pending deploy by the looked-up signature', () => {
  renderLookup({ pending: { data: { pending_deploys: [pending] } } });

  const call = (useSubscription as jest.Mock).mock.calls.find(([document]) =>
    operationName(document) === 'WatchPendingDeploy');
  expect(call[1]).toEqual(expect.objectContaining({ variables: { sig: SIG }, skip: false }));
});

test('does not look for a pending deploy when the indexer does not track pending deploys', () => {
  const { requested } = renderLookup({ enabled: false, pending: { data: { pending_deploys: [pending] } } });

  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
  expect(requested).not.toContain('WatchPendingDeploy');
  expect(requested).not.toContain('GetPendingDeploy');
});

test('keeps "not found" for a deploy that is neither indexed nor pending', () => {
  renderLookup({ pending: { data: { pending_deploys: [] } } });
  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
});

test('keeps "not found" when the pending lookup fails', () => {
  renderLookup({ pending: { data: undefined, error: new Error('field "pending_deploys" not found') } });
  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Deploy Pending' })).not.toBeInTheDocument();
});

test('keeps waiting for the deploy after it leaves the buffer before the indexer stores its block', () => {
  const { refetch, update, requested } = renderLookup({ pending: { data: { pending_deploys: [pending] } } });
  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();

  update({ pending: { data: { pending_deploys: [] } } });

  expect(screen.getByRole('heading', { name: 'Waiting for the Indexer' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(requested).toContain('WatchDeploymentIndexed');

  update({ indexed: { data: { deployments: [{ __typename: 'deployments', deploy_id: SIG }] } } });
  expect(refetch).toHaveBeenCalledTimes(1);
});

test('shows when the deploy was first seen and warns when the indexer status is older than 30 seconds', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-11T00:00:10Z'));
  renderLookup({
    pending: { data: { pending_deploys: [pending] } },
    status: { data: { indexer_state: pendingStatusRows({}, new Date('2026-11-11T00:00:05Z')) } },
  });
  expect(screen.getByText('First seen by indexer')).toBeInTheDocument();
  expect(screen.queryByRole('note', { name: 'Stale snapshot' })).not.toBeInTheDocument();

  jest.setSystemTime(new Date('2026-11-11T00:05:00Z'));
  act(() => { jest.advanceTimersByTime(5000); });

  expect(screen.getByRole('note', { name: 'Stale snapshot' })).toBeInTheDocument();
});
