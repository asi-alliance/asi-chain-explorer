import React from 'react';
import { render, screen } from '@testing-library/react';
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

function renderLookup(pendingResult: object) {
  const refetch = jest.fn();
  (useQuery as jest.Mock).mockImplementation((query, options) => {
    const name = query.definitions.find((d: any) => d.kind === 'OperationDefinition').name.value;
    if (name === 'GetPendingDeploy') {
      return options?.skip ? { data: undefined, loading: false } : { loading: false, ...pendingResult };
    }
    return { data: { deployments: [] }, loading: false, error: undefined, refetch };
  });
  render(
    <MemoryRouter initialEntries={[`/transaction/${SIG}`]}>
      <Routes><Route path="/transaction/:transactionId" element={<TransactionDetailPage />} /></Routes>
    </MemoryRouter>
  );
  return refetch;
}

afterEach(() => jest.useRealTimers());

test('shows a pending deploy instead of "not found" and refetches until it is indexed (issue #70)', () => {
  jest.useFakeTimers();
  const refetch = renderLookup({ data: { pending_deploys: [pending] } });

  expect(screen.getByRole('heading', { name: 'Deploy Pending' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Transaction Not Found' })).not.toBeInTheDocument();
  expect(screen.getByText(SIG)).toBeInTheDocument();
  expect(screen.getByText('#12')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Code' })).toBeInTheDocument();

  jest.advanceTimersByTime(5000);
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
