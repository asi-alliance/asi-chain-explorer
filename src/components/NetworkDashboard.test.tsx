import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import NetworkDashboard from './NetworkDashboard';
import { useIndexerStatus } from '../hooks/useIndexerStatus';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
}));

jest.mock('../hooks/useIndexerStatus', () => ({ useIndexerStatus: jest.fn() }));

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

jest.mock('recharts', () => {
  const React = require('react');
  const Passthrough = ({ children }: any) => React.createElement('div', null, children);
  return {
    ResponsiveContainer: Passthrough,
    ComposedChart: Passthrough,
    AreaChart: Passthrough,
    Area: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

jest.mock('framer-motion', () => {
  const React = require('react');
  const MotionDiv = ({ children, initial, animate, transition, ...rest }: any) =>
    React.createElement('div', rest, children);
  return { motion: new Proxy({}, { get: () => MotionDiv }) };
});

const bucket = (overrides: Record<string, string> = {}) => ({
  bucket_start: '2026-11-26T10:00:00Z',
  avg_block_time_seconds: '3.5',
  avg_tps: '0.00194444444444444444',
  deployments_count: '74',
  transfers_count: '2',
  ...overrides,
});

const statsData = (overrides: Record<string, any> = {}) => ({
  get_network_metrics: [bucket()],
  network_stats: [
    {
      total_validators: 3,
      active_validators: 3,
      validators_in_quarantine: 0,
      consensus_participation: '100.00',
      consensus_status: 'healthy',
      block_number: '10269',
    },
  ],
  blocks: [{ block_number: '10275', block_hash: 'abc' }],
  ...overrides,
});

const queryResult = (result: Record<string, any>) => ({
  refetch: jest.fn(),
  ...result,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <NetworkDashboard />
    </MemoryRouter>
  );

afterEach(() => {
  jest.clearAllMocks();
});

beforeEach(() => {
  (useIndexerStatus as jest.Mock).mockReturnValue({
    data: {
      lastIndexedBlock: 10274,
      latestBlock: 10275,
      lastUpdate: new Date(),
      lag: 1,
      percentage: 99.99,
      label: 'Syncing',
    },
    loading: false,
    error: false,
  });
});

test('shows consensus health and links the latest height', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: statsData(), loading: false })
  );
  renderPage();

  expect(screen.getByText('Consensus')).toBeInTheDocument();
  expect(screen.getByText('Healthy')).toBeInTheDocument();
  expect(screen.getByText('100.00% participation')).toBeInTheDocument();
  expect(screen.getByText('3 / 3')).toBeInTheDocument();
  expect(screen.getByText('No validators in quarantine')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '10,275' })).toHaveAttribute(
    'href',
    '/height/10275'
  );
  expect(screen.getByRole('link', { name: '3 / 3' })).toHaveAttribute(
    'href',
    '/validators'
  );
});

test('keeps tiny rates honest instead of rounding them to zero', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: statsData(), loading: false })
  );
  renderPage();

  expect(screen.getByText('0.0019')).toBeInTheDocument();
  expect(screen.getByText('3.5s')).toBeInTheDocument();
});

test('shows < 0.01 for rates below four-decimal precision', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({
      data: statsData({
        get_network_metrics: [
          bucket({
            avg_tps: '0.00001',
            deployments_count: '0',
            transfers_count: '0',
          }),
        ],
      }),
      loading: false,
    })
  );
  renderPage();

  expect(screen.getAllByText('< 0.01').length).toBeGreaterThan(0);
});

test('shows skeletons while the first response loads', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: undefined, loading: true })
  );
  const { container } = renderPage();

  expect(container.querySelectorAll('.skeleton--stat')).toHaveLength(5);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
});

test('offers a retry when statistics are unavailable', () => {
  const refetch = jest.fn();
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: undefined, loading: false, error: new Error('boom'), refetch })
  );
  renderPage();

  expect(screen.getByText('Statistics are unavailable.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  expect(refetch).toHaveBeenCalled();
});

test('marks a range without activity instead of drawing an empty chart', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({
      data: statsData({
        get_network_metrics: [
          bucket({
            deployments_count: '0',
            transfers_count: '0',
          }),
        ],
      }),
      loading: false,
    })
  );
  renderPage();

  expect(screen.getByText('No activity in this range')).toBeInTheDocument();
});

test('keeps a height above 2^53 exact in the card and its link', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({
      data: statsData({
        blocks: [{ block_number: '9007199254740993', block_hash: 'abc' }],
      }),
      loading: false,
    })
  );
  renderPage();

  expect(screen.getByRole('link', { name: '9,007,199,254,740,993' })).toHaveAttribute(
    'href',
    '/height/9007199254740993'
  );
});

test('shows the indexer status, sync progress and last indexed block', () => {
  const lastUpdate = new Date();
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({
      data: statsData({
        blocks: [{ block_number: '10451', block_hash: 'abc' }],
      }),
      loading: false,
    })
  );
  (useIndexerStatus as jest.Mock).mockReturnValue({
    data: {
      lastIndexedBlock: 10450,
      latestBlock: 10450,
      lastUpdate,
      lag: 0,
      percentage: 100,
      label: 'Synced',
    },
    loading: false,
    error: false,
  });
  renderPage();

  expect(screen.getByText('Indexer Status')).toBeInTheDocument();
  expect(screen.getByText('Synced')).toBeInTheDocument();
  expect(screen.getByText('100.00%')).toBeInTheDocument();
  expect(screen.getByText('0 blocks behind node #10,450')).toBeInTheDocument();
  expect(screen.getByText('Checked every 5 seconds')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '10,450' })).toHaveAttribute(
    'href',
    '/height/10450'
  );
  expect(screen.getByRole('progressbar', { name: 'Sync Progress progress' })).toHaveAttribute(
    'aria-valuenow',
    '100'
  );
  expect(screen.getByText(/^Last indexed /)).toHaveAttribute(
    'title',
    expect.stringMatching(/\d{4}/)
  );
});

test('keeps a nearly synced indexer below 100 percent', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: statsData(), loading: false })
  );
  (useIndexerStatus as jest.Mock).mockReturnValue({
    data: {
      lastIndexedBlock: 10274,
      latestBlock: 10275,
      lastUpdate: new Date(),
      lag: 1,
      percentage: 99.9999,
      label: 'Syncing',
    },
    loading: false,
    error: false,
  });
  renderPage();

  expect(screen.getByText('99.99%')).toBeInTheDocument();
  expect(screen.getByText('1 block behind node #10,275')).toBeInTheDocument();
});

test('reports indexer failure and an ahead cursor without a progress bar', () => {
  (useQuery as jest.Mock).mockReturnValue(
    queryResult({ data: statsData(), loading: false })
  );
  (useIndexerStatus as jest.Mock).mockReturnValue({
    data: null,
    loading: false,
    error: true,
  });
  const { unmount } = renderPage();

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Indexer status is unavailable. Retrying automatically.'
  );
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

  unmount();
  (useIndexerStatus as jest.Mock).mockReturnValue({
    data: {
      lastIndexedBlock: 120,
      latestBlock: 100,
      lastUpdate: new Date(),
      lag: -20,
      percentage: null,
      label: 'Ahead of node',
    },
    loading: false,
    error: false,
  });
  renderPage();

  expect(screen.getByText('20 blocks ahead of node #100')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'The indexer is ahead of the node.'
  );
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
