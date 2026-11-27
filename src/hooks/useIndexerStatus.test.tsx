import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { useIndexerStatus } from './useIndexerStatus';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalEndpoint = process.env.REACT_APP_INDEXER_API_URL;
const status = (cursor = 100, latest = 100) => ({
  indexer: { running: true, last_indexed_block: cursor, last_sync_time: '2026-11-03T20:00:00' },
  node: { connected: true, latest_block: latest },
});
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

function Probe() {
  const { data, loading, error } = useIndexerStatus();
  return (
    <pre data-testid="state">{JSON.stringify({
      loading,
      error,
      label: loading ? 'Loading' : data?.label ?? 'Unavailable',
      lastIndexedBlock: data?.lastIndexedBlock ?? null,
      latestBlock: data?.latestBlock ?? null,
      lastUpdate: data?.lastUpdate?.toISOString() ?? null,
      lag: data?.lag ?? null,
      percentage: data?.percentage ?? null,
    })}</pre>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent || '{}');

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

test('reads the current status endpoint and exposes the real cursor and node height', async () => {
  fetchMock.mockResolvedValue(reply(status(80, 100)));
  render(<Probe />);
  await flush();

  expect(fetchMock).toHaveBeenCalledWith('/api/indexer/status', expect.objectContaining({ cache: 'no-store' }));
  expect(state()).toMatchObject({
    label: 'Syncing',
    lastIndexedBlock: 80,
    latestBlock: 100,
    lag: 20,
    percentage: 80,
  });
});

test('marks a truly caught-up cursor as synced, including indexed genesis', async () => {
  fetchMock.mockResolvedValue(reply(status(0, 0)));
  render(<Probe />);
  await flush();

  expect(state()).toMatchObject({ label: 'Synced', percentage: 100 });
});

test('reports a cursor ahead of the node without claiming successful synchronization', async () => {
  fetchMock.mockResolvedValueOnce(reply(status(120, 100))).mockResolvedValueOnce(reply(status(120, 120)));
  render(<Probe />);
  await flush();
  expect(state()).toMatchObject({ label: 'Ahead of node', lag: -20, percentage: null });

  await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
  expect(state()).toMatchObject({ label: 'Synced', lag: 0, percentage: 100 });
});

test('one block behind a large chain remains syncing and below 100 percent', async () => {
  fetchMock.mockResolvedValue(reply(status(999999, 1000000)));
  render(<Probe />);
  await flush();

  expect(state().label).toBe('Syncing');
  expect(state().percentage).toBeCloseTo(99.9999, 4);
});

test('an empty index has an unknown cursor and update time, not a fake successful sync', async () => {
  // A newly migrated database timestamps the -1 cursor before any block is indexed.
  fetchMock.mockResolvedValue(reply(status(-1, 0)));
  render(<Probe />);
  await flush();

  expect(state()).toMatchObject({
    label: 'Waiting for first block',
    lastIndexedBlock: null,
    lastUpdate: null,
    percentage: 0,
  });
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
  render(<Probe />);
  await flush();

  expect(state()).toMatchObject({ label: 'Unavailable', lastIndexedBlock: null, error: true });
});

test('node disconnection hides progress and a stopped indexer cannot look synced', async () => {
  const current = status();
  fetchMock.mockResolvedValueOnce(reply({ ...current, node: { connected: false } }))
    .mockResolvedValueOnce(reply({ ...current, indexer: { ...current.indexer, running: false } }));
  render(<Probe />);
  await flush();
  expect(state()).toMatchObject({ label: 'Unavailable', latestBlock: null, percentage: null });

  await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
  expect(state()).toMatchObject({ label: 'Stopped', latestBlock: 100 });
});

test('poll failure clears an earlier green snapshot and a later poll recovers', async () => {
  fetchMock.mockResolvedValueOnce(reply(status())).mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(reply(status(120, 125)));
  render(<Probe />);
  await flush();
  expect(state().label).toBe('Synced');

  await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
  expect(state()).toMatchObject({ label: 'Unavailable', lastIndexedBlock: null, error: true });

  await act(async () => { jest.advanceTimersByTime(5000); await Promise.resolve(); });
  expect(state()).toMatchObject({ label: 'Syncing', lastIndexedBlock: 120, error: false });
});

test('bounds slow requests, avoids overlap, and aborts when leaving the page', async () => {
  fetchMock.mockImplementation((_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const { unmount } = render(<Probe />);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(state()).toMatchObject({ label: 'Unavailable', error: true });
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
  render(<Probe />);
  await flush();

  expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/indexer/status');
});
