import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLazyQuery, useQuery } from '@apollo/client';
import TransactionTrackerImproved from './TransactionTrackerImproved';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useLazyQuery: jest.fn(),
}));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

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

const queryCalls: Array<{ name: string; variables: any }> = [];

beforeEach(() => {
  queryCalls.length = 0;
  (useQuery as jest.Mock).mockImplementation((query, options) => {
    const name = query.definitions?.[0]?.name?.value;
    queryCalls.push({ name, variables: options?.variables });
    if (name === 'GetTransactionCounts') {
      return {
        data: {
          deployments_aggregate: { aggregate: { count: 51 } },
          contract_deployments: { aggregate: { count: 30 } },
          transfer_deployments: { aggregate: { count: 21 } },
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

test('splits deploys into non-overlapping all, contract and transfer tabs', () => {
  render(<MemoryRouter initialEntries={['/transactions']}><TransactionTrackerImproved /></MemoryRouter>);

  expect(screen.getByRole('button', { name: 'All deploys (51)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Contract deploys (30)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Transfers (21)' })).toBeInTheDocument();
  expect(
    screen.getByText('51 deploys: 30 contract + 21 with transfers')
  ).toBeInTheDocument();
  expect(screen.queryByText('72 total')).not.toBeInTheDocument();
  expect(screen.getByText('Showing 1-20 of 51')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export recent deployments as CSV' })).toBeInTheDocument();
});

test('opens the transfers tab from the URL', () => {
  render(<MemoryRouter initialEntries={['/transactions?tab=transfers']}><TransactionTrackerImproved /></MemoryRouter>);

  expect(screen.getByRole('button', { name: 'Transfers (21)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'All deploys (51)' })).toHaveAttribute('aria-pressed', 'false');
});

test('filters the contract tab to deploys without transfers', () => {
  render(<MemoryRouter initialEntries={['/transactions?tab=contract']}><TransactionTrackerImproved /></MemoryRouter>);

  expect(screen.getByRole('button', { name: 'Contract deploys (30)' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Showing 1-20 of 30')).toBeInTheDocument();

  const paginated = queryCalls.find((call) => call.name === 'GetPaginatedTransactions');
  expect(paginated?.variables.deploymentWhere).toEqual({ _not: { transfers: {} } });
});

test('does not filter the all deploys tab', () => {
  render(<MemoryRouter initialEntries={['/transactions']}><TransactionTrackerImproved /></MemoryRouter>);

  const paginated = queryCalls.find((call) => call.name === 'GetPaginatedTransactions');
  expect(paginated?.variables.deploymentWhere).toEqual({});
});

test('uses the contract-filtered search stream before its limit', () => {
  const withTransfer = deployments.slice(0, 30).map((deployment) => ({
    ...deployment,
    transfers: [{ id: 1 }],
  }));
  const contractOnly = {
    ...deployments[0],
    deploy_id: 'contract-only',
    transfers: [],
  };
  (useLazyQuery as jest.Mock).mockReturnValue([
    jest.fn(),
    {
      data: {
        deployments: withTransfer,
        contract_deployments: [contractOnly],
        transfers: [],
      },
      loading: false,
    },
  ]);
  render(<MemoryRouter initialEntries={['/transactions']}><TransactionTrackerImproved /></MemoryRouter>);

  fireEvent.change(screen.getByPlaceholderText('Search by ID, address, or block hash...'), {
    target: { value: 'contract' },
  });
  expect(screen.getByRole('button', { name: 'Contract deploys (1)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Contract deploys (1)' }));

  expect(screen.getByText('1 matching contract deploys')).toBeInTheDocument();
  expect(screen.getByText('Deploy by 04ababab...')).toBeInTheDocument();
});
