import React from 'react';
import { PendingDeploysStatusProvider } from '../hooks/usePendingDeploysStatus';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  pendingHttp?: OperationResult;
  indexedHttp?: OperationResult;
  statusHttp?: OperationResult;
  status?: OperationResult;
  details?: OperationResult;
  enabled?: boolean;
}

let state: Lookup = {};

function renderLookup(initial: Lookup) {
  state = initial;
  const refetch = jest.fn().mockResolvedValue({ data: { deployments: [] } });
  const statusData = () => (state.status ?? { data: { indexer_state: pendingStatusRows() } });
  const requested = mockOperations({
    GetTransactionDetails: () => state.details ?? { data: { deployments: [] }, refetch },
    WatchPendingDeploysStatus: () =>
      state.enabled === false ? { data: { indexer_state: [] } } : statusData(),
    GetPendingDeploy: () => state.pendingHttp ?? {},
    GetDeploymentIndexed: () => state.indexedHttp ?? {},
    GetPendingDeploysStatus: () => state.statusHttp ?? {},
    WatchPendingDeploy: () => state.pending ?? { data: { pending_deploys: [] } },
    WatchDeploymentIndexed: () => state.indexed ?? { data: { deployments: [] } },
  });
  const page = () => (
    <MemoryRouter initialEntries={[`/transaction/${SIG}`]}>
      <PendingDeploysStatusProvider>
        <Routes><Route path="/transaction/:transactionId" element={<TransactionDetailPage />} /></Routes>
      </PendingDeploysStatusProvider>
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

test('shows a pending deploy instead of "not found" and reloads when the deploy is indexed (issue #70)', async () => {
  const { refetch, update } = renderLookup({ pending: { data: { pending_deploys: [pending] } } });

  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(screen.getByText(SIG)).toBeInTheDocument();
  expect(screen.getByText('#12')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();
  expect(refetch).not.toHaveBeenCalled();

  update({ indexed: { data: { deployments: [{ __typename: 'deployments', deploy_id: SIG }] } } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Transaction details unavailable' })).toBeInTheDocument();
  expect(refetch).toHaveBeenCalledTimes(1);
});

test('releases per-deploy subscriptions when the wait expires and resumes on request', async () => {
  jest.useFakeTimers();
  const { requested } = renderLookup({ pending: { data: { pending_deploys: [pending] } } });
  requested.length = 0;
  act(() => { jest.advanceTimersByTime(180_000); });
  expect(screen.getByRole('heading', { name: 'Deploy status unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/still pending when the three-minute watch ended/)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Automatic updates stopped');
  expect(requested).not.toContain('WatchDeploymentIndexed');
  expect(requested).not.toContain('WatchPendingDeploy');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check again' })); });
  expect(requested).toContain('WatchPendingDeploy');
});

test('keeps the missing transaction ID visible after the watch expires', () => {
  jest.useFakeTimers();
  renderLookup({});
  act(() => { jest.advanceTimersByTime(180_000); });
  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
  expect(screen.getByText(`Transaction ${SIG} could not be found.`)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Automatic updates stopped');
});

test.each([true, false])('refetches on inclusion without seeing a pending row (tracking %s)', async enabled => {
  const { refetch, requested } = renderLookup({
    enabled,
    indexed: { data: { deployments: [{ deploy_id: SIG }] } },
  });

  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  expect(requested).toContain('WatchDeploymentIndexed');
  expect(requested.includes('WatchPendingDeploy')).toBe(enabled);
});

test('subscribes to the pending deploy by the looked-up signature', () => {
  renderLookup({ pending: { data: { pending_deploys: [pending] } } });

  const call = (useSubscription as jest.Mock).mock.calls.find(([document]) =>
    operationName(document) === 'WatchPendingDeploy');
  expect(call[1]).toEqual(expect.objectContaining({ variables: { sig: SIG }, skip: false }));
});

test('does not look for a pending deploy when the indexer does not track pending deploys', () => {
  const { requested } = renderLookup({ enabled: false, pending: { data: { pending_deploys: [pending] } } });

  expect(screen.getByRole('heading', { name: 'Deploy not indexed yet' })).toBeInTheDocument();
  expect(requested).not.toContain('WatchPendingDeploy');
  expect(requested).not.toContain('GetPendingDeploy');
});

test('keeps checking while a deploy that is neither indexed nor pending may still arrive', () => {
  renderLookup({ pending: { data: { pending_deploys: [] } } });
  expect(screen.getByRole('heading', { name: 'Deploy not indexed yet' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('keeps checking for three minutes');
});

const socketFailure = { error: new Error('WebSocket unavailable') };
const httpFailure = { error: new Error('HTTP unavailable') };

test.each([true, false])('reports an unavailable status after both pending reads fail (seen %s)', seen => {
  const { update, requested } = renderLookup({ pending: { data: { pending_deploys: seen ? [pending] : [] } } });
  update({ pending: socketFailure, pendingHttp: httpFailure });

  expect(requested).toContain('GetPendingDeploy');
  expect(screen.getByRole('heading', { name: 'Unable to verify deploy status' })).toBeInTheDocument();
  expect(screen.queryByText(/no longer visible in the pending snapshot/)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();

  // The HTTP fallback confirms an empty buffer on the next successful poll.
  update({ pendingHttp: { data: { pending_deploys: [] } } });
  expect(screen.getByRole('heading', { name: seen ? 'Waiting for the Indexer' : 'Deploy not indexed yet' }))
    .toBeInTheDocument();
});

test.each([
  { indexed: socketFailure, indexedHttp: httpFailure },
  { status: socketFailure, statusHttp: httpFailure },
])('reports an unavailable status if inclusion or indexer status cannot be checked', failure => {
  renderLookup(failure);
  expect(screen.getByRole('heading', { name: 'Unable to verify deploy status' })).toBeInTheDocument();
});

test('keeps waiting for the deploy after it leaves the buffer before the indexer stores its block', async () => {
  const { refetch, update, requested } = renderLookup({ pending: { data: { pending_deploys: [pending] } } });
  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();

  update({ pending: { data: { pending_deploys: [] } } });

  expect(screen.getByRole('heading', { name: 'Waiting for the Indexer' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(requested).toContain('WatchDeploymentIndexed');

  update({ indexed: { data: { deployments: [{ __typename: 'deployments', deploy_id: SIG }] } } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument());
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

test('shows the executed deploy fee in ASI using the block decimals', async () => {
  renderLookup({
    details: {
      data: {
        deployments: [{
          __typename: 'deployments', deploy_id: SIG, deployer: '04' + 'ab'.repeat(32),
          term: 'new x in { x!(1) }', timestamp: '1762770000000', deployment_type: 'contract_call',
          phlo_cost: '277155', phlo_price: '100000000000', phlo_limit: '1000000',
          valid_after_block_number: '903', status: 'included', errored: false,
          block_number: '904', block_hash: 'b'.repeat(64), created_at: '2026-11-11T00:00:00',
          transfers: [],
          block: {
            __typename: 'blocks', block_number: 904, block_hash: 'b'.repeat(64),
            token_decimals: 18, parent_links: [], timestamp: '1762770000000',
            proposer: 'v', deployment_count: 1, state_hash: 's', finalization_status: 'finalized',
            justifications: [], created_at: '2026-11-11T00:00:00',
          },
        }],
      },
    },
  });

  expect(await screen.findByText('0.0277155 ASI')).toBeInTheDocument();
  expect(screen.getByText(/precharge up to 0.1 ASI/)).toBeInTheDocument();
  expect(screen.getAllByText(SIG)).toHaveLength(1);
  expect(screen.queryByText(/Transaction has been processed/)).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Transaction Included/ }))
    .toHaveAttribute('title', expect.stringContaining('processed and included'));
});

test('labels RChain mainnet deployments in the genesis block', async () => {
  renderLookup({
    details: {
      data: {
        deployments: [{
          __typename: 'deployments', deploy_id: SIG, deployer: '04' + 'ab'.repeat(32),
          term: 'new x in { x!(1) }', timestamp: '1559156071321', deployment_type: 'registry_lookup',
          phlo_cost: '0', phlo_price: '0', phlo_limit: '0',
          valid_after_block_number: '0', status: 'included', errored: false,
          block_number: '0', block_hash: 'a'.repeat(64), created_at: '2019-05-29T18:54:31',
          transfers: [],
          block: {
            __typename: 'blocks', block_number: 0, block_hash: 'a'.repeat(64),
            token_decimals: 18, parent_links: [], timestamp: '1795610867000',
            proposer: 'v', deployment_count: 10, state_hash: 's', finalization_status: 'finalized',
            justifications: [], created_at: '2026-11-25T12:47:47',
          },
        }],
      },
    },
  });

  expect(await screen.findByText('Genesis deployment')).toBeInTheDocument();
  expect(screen.getByText(/Imported from RChain mainnet/)).toBeInTheDocument();
  expect(screen.queryByText(/over 7 years ago/)).not.toBeInTheDocument();
});
