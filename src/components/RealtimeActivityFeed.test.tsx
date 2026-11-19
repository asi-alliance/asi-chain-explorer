import React, { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { useQuery } from '@apollo/client';
import RealtimeActivityFeed from './RealtimeActivityFeed';

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
