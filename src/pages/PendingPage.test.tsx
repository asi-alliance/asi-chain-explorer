import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import PendingPage from './PendingPage';
import TransactionsPage from './TransactionsPage';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});
jest.mock('../components/TransactionTrackerImproved', () => () => <section aria-label="Transaction list" />);

beforeEach(() => {
  (useQuery as jest.Mock).mockReturnValue({
    loading: false,
    error: undefined,
    data: { pending_deploys: [], pending_deploys_aggregate: { aggregate: { count: 0 } }, indexer_state: [] },
  });
});

test('shows the pending deploys on their own page (issue #70)', () => {
  render(<MemoryRouter><PendingPage /></MemoryRouter>);
  expect(screen.getByRole('region', { name: 'Pending Deploys' })).toBeInTheDocument();
});

test('keeps the pending deploys off the transactions page', () => {
  render(<MemoryRouter><TransactionsPage /></MemoryRouter>);
  expect(screen.getByRole('region', { name: 'Transaction list' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Pending Deploys' })).not.toBeInTheDocument();
});
