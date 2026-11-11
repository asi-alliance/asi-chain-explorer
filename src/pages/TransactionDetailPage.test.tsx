import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import TransactionDetailPage from './TransactionDetailPage';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
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

let pendingResult: object = {};

function renderLookup(initialPending: object) {
  pendingResult = initialPending;
  const refetch = jest.fn();
  (useQuery as jest.Mock).mockImplementation((query, options) => {
    const name = query.definitions.find((d: any) => d.kind === 'OperationDefinition').name.value;
    if (name === 'GetPendingDeploy') {
      return options?.skip ? { data: undefined, loading: false } : { loading: false, ...pendingResult };
    }
    return { data: { deployments: [] }, loading: false, error: undefined, refetch };
  });
  const page = () => (
    <MemoryRouter initialEntries={[`/transaction/${SIG}`]}>
      <Routes><Route path="/transaction/:transactionId" element={<TransactionDetailPage />} /></Routes>
    </MemoryRouter>
  );
  const { rerender } = render(page());
  const setPending = (next: object) => {
    pendingResult = next;
    rerender(page());
  };
  return { refetch, setPending };
}

afterEach(() => jest.useRealTimers());

test('shows a pending deploy instead of "not found" and refetches until it is indexed (issue #70)', () => {
  jest.useFakeTimers();
  const { refetch } = renderLookup({ data: { pending_deploys: [pending] } });

  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(screen.getByText(SIG)).toBeInTheDocument();
  expect(screen.getByText('#12')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();

  act(() => { jest.advanceTimersByTime(5000); });
  expect(refetch).toHaveBeenCalledTimes(1);
});

test('requests the pending snapshot by the looked-up signature', () => {
  renderLookup({ data: { pending_deploys: [pending] } });

  const call = (useQuery as jest.Mock).mock.calls.find(([query]) =>
    query.definitions.some((d: any) => d.name?.value === 'GetPendingDeploy'));
  expect(call[1]).toEqual(expect.objectContaining({ variables: { sig: SIG }, skip: false }));
});

test('keeps "not found" for a deploy that is neither indexed nor pending', () => {
  renderLookup({ data: { pending_deploys: [] } });
  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
});

test('keeps "not found" when the pending lookup fails', () => {
  renderLookup({ data: undefined, error: new Error('field "pending_deploys" not found') });
  expect(screen.getByRole('heading', { name: 'Transaction Not Found' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Deploy Pending' })).not.toBeInTheDocument();
});

test('keeps refetching the deploy after it leaves the node buffer before the indexer stores its block', () => {
  jest.useFakeTimers();
  const { refetch, setPending } = renderLookup({ data: { pending_deploys: [pending] } });
  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();

  setPending({ data: { pending_deploys: [] } });

  expect(screen.getByRole('heading', { name: 'Waiting for the Indexer' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(10000); });
  expect(refetch).toHaveBeenCalledTimes(2);
});

test('warns when the pending-deploy snapshot is older than one minute', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-11T00:00:10Z'));
  renderLookup({ data: { pending_deploys: [pending] } });
  expect(screen.queryByRole('note', { name: 'Stale snapshot' })).not.toBeInTheDocument();

  jest.setSystemTime(new Date('2026-11-11T00:05:00Z'));
  act(() => { jest.advanceTimersByTime(5000); });

  expect(screen.getByRole('note', { name: 'Stale snapshot' })).toBeInTheDocument();
});
