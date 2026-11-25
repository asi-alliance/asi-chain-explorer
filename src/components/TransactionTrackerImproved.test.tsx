import React from 'react';
import { render, screen } from '@testing-library/react';
import { useLazyQuery, useQuery } from '@apollo/client';
import TransactionTrackerImproved from './TransactionTrackerImproved';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useLazyQuery: jest.fn(),
}));

const deployments = Array.from({ length: 20 }, (_, index) => ({
  __typename: 'deployments',
  deploy_id: `deploy-${index}`,
  deployer: '04' + 'ab'.repeat(32),
  term: 'Nil',
  timestamp: String(1762770000000 - index * 1000),
  deployment_type: 'contract_call',
  phlo_cost: '1',
  phlo_price: '1',
  phlo_limit: '1',
  status: 'included',
  block_number: String(2048 - index),
  errored: false,
  error_message: null,
}));

beforeEach(() => {
  (useQuery as jest.Mock).mockImplementation((query) => {
    const name = query.definitions?.[0]?.name?.value;
    if (name === 'GetTransactionCounts') {
      return {
        data: {
          deployments_aggregate: { aggregate: { count: 51 } },
          transfers_aggregate: { aggregate: { count: 21 } },
        },
        loading: false,
      };
    }
    return { data: { deployments, transfers: [] }, loading: false };
  });
  (useLazyQuery as jest.Mock).mockReturnValue([jest.fn(), { data: undefined, loading: false }]);
});

afterEach(() => {
  jest.clearAllMocks();
});

test('shows one icon tab row and a single export footer instead of the old summary bar', () => {
  render(<TransactionTrackerImproved />);

  expect(screen.getByRole('button', { name: 'Deployments (51)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Transfers (21)' })).toBeInTheDocument();
  expect(screen.getByText('72 total')).toBeInTheDocument();
  expect(screen.queryByText('72 Total')).not.toBeInTheDocument();
  expect(screen.getByText('Showing 1-20 of 51')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export recent deployments as CSV' })).toBeInTheDocument();
});
