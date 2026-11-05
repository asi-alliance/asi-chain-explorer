import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import IndexerStatusPage from './IndexerStatusPage';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalEndpoint = process.env.REACT_APP_INDEXER_API_URL;
const status = (cursor = 100, latest = 100) => ({
  indexer: { running: true, last_indexed_block: cursor, last_sync_time: '2026-11-03T20:00:00' },
  node: { connected: true, latest_block: latest },
});
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const cell = (label: string) => within(screen.getByRole('row', { name: new RegExp(`^${label} `) })).getAllByRole('cell')[1];

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  delete process.env.REACT_APP_INDEXER_API_URL;
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  if (originalEndpoint === undefined) delete process.env.REACT_APP_INDEXER_API_URL;
  else process.env.REACT_APP_INDEXER_API_URL = originalEndpoint;
});

test('reads the current status endpoint and renders the real cursor and node height', async () => {
  fetchMock.mockResolvedValue(reply(status(80, 100)));
  render(<IndexerStatusPage />);
  await flush();
  expect(fetchMock).toHaveBeenCalledWith('/api/indexer/status', expect.objectContaining({ cache: 'no-store' }));
  expect(cell('Last Indexed Block')).toHaveTextContent('80');
  expect(cell('Node Finalized Block')).toHaveTextContent('100');
  expect(cell('Sync Status')).toHaveTextContent('Syncing');
  expect(screen.getByText('20 blocks behind')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
});

test('marks a truly caught-up cursor as synced, including indexed genesis', async () => {
  fetchMock.mockResolvedValue(reply(status(0, 0)));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Synced');
  expect(screen.getByText('100.00%')).toBeInTheDocument();
});

test('reports a cursor ahead of the node without claiming successful synchronization', async () => {
  fetchMock.mockResolvedValueOnce(reply(status(120, 100))).mockResolvedValueOnce(reply(status(120, 120)));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Ahead of node');
  expect(screen.getByText('20 blocks ahead of node')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('ahead of the node');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('100.00%')).not.toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(cell('Sync Status')).toHaveTextContent('Synced');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('one block behind a large chain remains syncing and below 100 percent', async () => {
  fetchMock.mockResolvedValue(reply(status(999999, 1000000)));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Syncing');
  expect(screen.getByText('99.99%')).toBeInTheDocument();
  expect(screen.getByText('1 block behind')).toBeInTheDocument();
});

test('an empty index has unknown cursor and update time, not a fake successful sync', async () => {
  const empty = status(-1, 0);
  // A newly migrated database timestamps the -1 cursor before any block is indexed.
  fetchMock.mockResolvedValue(reply(empty));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Last Indexed Block')).toHaveTextContent('Unknown');
  expect(cell('Sync Status')).toHaveTextContent('Waiting for first block');
  expect(screen.getByText('0.00%')).toBeInTheDocument();
  expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
});

test.each([
  ['HTTP failure', () => Promise.resolve(reply({}, false))],
  ['network failure', () => Promise.reject(new Error('offline'))],
  ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new Error('bad JSON'); } })],
  ['server error body', () => Promise.resolve(reply({ error: 'unavailable' }))],
  ['missing fields', () => Promise.resolve(reply({}))],
  ['unsafe height', () => Promise.resolve(reply(status(2 ** 53, 2 ** 53)))],
])('%s shows unavailable without fabricated metrics', async (_, result) => {
  fetchMock.mockImplementation(result);
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Unavailable');
  expect(cell('Last Indexed Block')).toHaveTextContent('Unknown');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

test('node disconnection hides progress and a stopped indexer cannot look synced', async () => {
  const current = status();
  fetchMock.mockResolvedValueOnce(reply({ ...current, node: { connected: false } }))
    .mockResolvedValueOnce(reply({ ...current, indexer: { ...current.indexer, running: false } }));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Unavailable');
  expect(cell('Node Finalized Block')).toHaveTextContent('Unknown');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(cell('Sync Status')).toHaveTextContent('Stopped');
});

test('poll failure clears an earlier green snapshot and a later poll recovers', async () => {
  fetchMock.mockResolvedValueOnce(reply(status())).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(reply(status(120, 125)));
  render(<IndexerStatusPage />);
  await flush();
  expect(cell('Sync Status')).toHaveTextContent('Synced');
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(cell('Sync Status')).toHaveTextContent('Unavailable');
  expect(cell('Last Indexed Block')).toHaveTextContent('Unknown');
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(cell('Last Indexed Block')).toHaveTextContent('120');
  expect(cell('Sync Status')).toHaveTextContent('Syncing');
});

test('bounds slow requests, avoids overlap, and aborts when leaving the page', async () => {
  fetchMock.mockImplementation((_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const { unmount } = render(<IndexerStatusPage />);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(cell('Sync Status')).toHaveTextContent('Unavailable');
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const signal = fetchMock.mock.calls[1][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { jest.advanceTimersByTime(20000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('supports a configured public proxy base without a double slash', async () => {
  process.env.REACT_APP_INDEXER_API_URL = 'https://example.test/indexer/';
  fetchMock.mockResolvedValue(reply(status()));
  render(<IndexerStatusPage />);
  await flush();
  expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/indexer/status');
});
