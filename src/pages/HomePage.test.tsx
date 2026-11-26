import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useLazyQuery, useQuery } from '@apollo/client';
import HomePage from './HomePage';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useLazyQuery: jest.fn(),
}));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});
jest.mock('../components/RealtimeActivityFeed', () => () => null);
jest.mock('../components/RecentDataExporter', () => ({
  __esModule: true,
  default: () => null,
  ExportEntities: { BLOCKS: 'blocks', DEPLOYMENTS: 'deployments', TRANSFERS: 'transfers' },
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

function operationName(query: any): string {
  return query.definitions.find((definition: any) => definition.kind === 'OperationDefinition')?.name?.value ?? '';
}

function renderHome() {
  return render(<MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter>);
}

beforeEach(() => {
  (useQuery as jest.Mock).mockImplementation(() => ({
    data: { blocks: [], network_stats: [] }, loading: false, refetch: jest.fn(),
  }));
  (useLazyQuery as jest.Mock).mockReturnValue([jest.fn(), { data: undefined, loading: false }]);
});

test('clears and restores Home filters without a URL loop', async () => {
  render(
    <MemoryRouter initialEntries={['/?q=123']}>
      <HomePage />
      <LocationProbe />
      <BackButton />
    </MemoryRouter>
  );

  const input = screen.getByPlaceholderText('Height or hash');
  expect(input).toHaveValue('123');
  fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  expect(input).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?q=123'));
  expect(input).toHaveValue('123');
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(screen.getByTestId('location')).toHaveTextContent('/?q=123');
});

test('shows skeleton rows and cards while the overview loads', () => {
  (useQuery as jest.Mock).mockImplementation(() => ({
    data: undefined, loading: true, refetch: jest.fn(),
  }));
  renderHome();

  expect(screen.getByRole('status', { name: 'Loading recent blocks' })).toBeInTheDocument();
  expect(document.querySelectorAll('.skeleton--stat')).toHaveLength(4);
});

test('shows explicit overview and block errors with Retry actions', () => {
  const refetchStats = jest.fn();
  const refetchRecent = jest.fn();
  const refetchBlocks = jest.fn();
  (useQuery as jest.Mock).mockImplementation((query) => {
    const name = operationName(query);
    if (name === 'GetNetworkStats') {
      return { data: undefined, loading: false, error: new Error('stats down'), refetch: refetchStats };
    }
    if (name === 'GetRecentBlocks') {
      return {
        data: { blocks: [{ block_number: '7589', block_hash: 'a'.repeat(64), timestamp: String(Date.now()) }] },
        loading: false, error: new Error('recent down'), refetch: refetchRecent,
      };
    }
    return { data: undefined, loading: false, error: new Error('blocks down'), refetch: refetchBlocks };
  });
  renderHome();

  expect(screen.getByText('Some overview data could not be refreshed.')).toBeInTheDocument();
  expect(screen.getByText('Recent blocks are unavailable.')).toBeInTheDocument();
  expect(screen.getByText('7589')).toBeInTheDocument();

  const retries = screen.getAllByRole('button', { name: /Retry/ });
  fireEvent.click(retries[0]);
  expect(refetchStats).toHaveBeenCalledTimes(1);
  expect(refetchRecent).toHaveBeenCalledTimes(1);
  fireEvent.click(retries[1]);
  expect(refetchBlocks).toHaveBeenCalledTimes(1);
});

test('shows an unavailable overview when both overview queries fail', () => {
  const refetchStats = jest.fn();
  const refetchRecent = jest.fn();
  (useQuery as jest.Mock).mockImplementation((query) => {
    const name = operationName(query);
    if (name === 'GetNetworkStats') {
      return { data: undefined, loading: false, error: new Error('stats down'), refetch: refetchStats };
    }
    if (name === 'GetRecentBlocks') {
      return { data: undefined, loading: false, error: new Error('recent down'), refetch: refetchRecent };
    }
    return { data: { blocks: [] }, loading: false, refetch: jest.fn() };
  });
  renderHome();

  expect(screen.getByText('Network overview is unavailable.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  expect(refetchStats).toHaveBeenCalledTimes(1);
  expect(refetchRecent).toHaveBeenCalledTimes(1);
});

test('keeps loaded blocks when a refresh fails', () => {
  const refetchBlocks = jest.fn();
  const block = {
    block_hash: 'a'.repeat(64), block_number: '7589', proposer: '04' + 'b'.repeat(64),
    timestamp: String(Date.now()), finalization_status: 'finalized',
  };
  (useQuery as jest.Mock).mockImplementation((query) => {
    const name = operationName(query);
    if (name === 'GetNetworkStats') return { data: { network_stats: [{ active_validators: 3 }] }, loading: false, refetch: jest.fn() };
    if (name === 'GetRecentBlocks') return { data: { blocks: [block] }, loading: false, refetch: jest.fn() };
    return { data: { blocks: [block] }, loading: false, error: new Error('refresh failed'), refetch: refetchBlocks };
  });
  renderHome();

  expect(screen.getByRole('link', { name: /Open height 7589/ })).toBeInTheDocument();
  expect(screen.getByText('Recent blocks could not be refreshed.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  expect(refetchBlocks).toHaveBeenCalledTimes(1);
});

test('labels the block status legend instead of relying on colour', () => {
  renderHome();
  const legend = screen.getByRole('group', { name: 'Block status legend' });
  expect(within(legend).getByText('Confirmed')).toBeInTheDocument();
  expect(within(legend).getByText('Unfinalized')).toBeInTheDocument();
});
