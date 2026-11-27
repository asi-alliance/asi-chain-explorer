import React, { Profiler } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQuery } from '@apollo/client';
import RealtimeActivityFeed from './RealtimeActivityFeed';
import { GET_LATEST_BLOCKS, GET_LATEST_DEPLOYMENTS, GET_LATEST_TRANSFERS } from '../graphql/queries';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));

test.each([
  ['loading', { data: undefined, loading: true }],
  ['failed', { data: undefined, loading: false, error: new Error('network error') }],
])('does not re-render in a loop while the activity queries are %s', async (_, result) => {
  (useQuery as jest.Mock).mockReturnValue(result);
  let renders = 0;
  render(
    <Profiler id="feed" onRender={() => { renders += 1; }}>
      <RealtimeActivityFeed />
    </Profiler>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(renders).toBeLessThan(5);
});

test('shows activity skeletons while the feed loads', () => {
  (useQuery as jest.Mock).mockReturnValue({ data: undefined, loading: true });
  render(<RealtimeActivityFeed compact />);

  expect(screen.getByRole('status', { name: 'Loading live activity' })).toBeInTheDocument();
  expect(document.querySelectorAll('.live-activity-skeleton__row')).toHaveLength(4);
});

test('keeps DAG siblings distinct in the live activity feed', async () => {
  const now = Date.now();
  const blocks = { blocks: [
    { block_number: '100', block_hash: 'aaaa1111bbbb2222', proposer: 'p1', timestamp: String(now), deployment_count: 1 },
    { block_number: '100', block_hash: 'cccc3333dddd4444', proposer: 'p2', timestamp: String(now - 1000), deployment_count: 2 },
  ] };
  const transfers = { transfers: [] };
  const deployments = { deployments: [] };
  (useQuery as jest.Mock).mockImplementation((query) => {
    if (query === GET_LATEST_BLOCKS) return { data: blocks };
    if (query === GET_LATEST_TRANSFERS) return { data: transfers };
    if (query === GET_LATEST_DEPLOYMENTS) return { data: deployments };
    return { data: undefined };
  });
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<RealtimeActivityFeed compact />);
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  expect(screen.getAllByText('Block #100')).toHaveLength(2);
  expect(screen.getByText(/aaaa1111…/)).toBeInTheDocument();
  expect(screen.getByText(/cccc3333…/)).toBeInTheDocument();
  expect(error.mock.calls.some(call => String(call[0]).includes('same key'))).toBe(false);
  error.mockRestore();
});
