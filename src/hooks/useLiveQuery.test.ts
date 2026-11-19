import { act, renderHook } from '@testing-library/react';
import { gql, useQuery, useSubscription } from '@apollo/client';
import { LIVE_FALLBACK_POLL_MS, useLiveQuery } from './useLiveQuery';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useSubscription: jest.fn(),
}));

const WATCH = gql`subscription WatchThing($id: String!) { things(where: { id: { _eq: $id } }) { id } }`;
const GET = gql`query GetThing($id: String!) { things(where: { id: { _eq: $id } }) { id } }`;
const variables = { id: 'a' };

function run(subscription: object, query: object = {}, skip = false) {
  (useSubscription as jest.Mock).mockReturnValue({ data: undefined, loading: false, error: undefined, ...subscription });
  (useQuery as jest.Mock).mockReturnValue({ data: undefined, loading: false, error: undefined, ...query });
  return renderHook(() => useLiveQuery(WATCH, GET, { variables, skip })).result.current;
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

test('continues polling during a reconnect and stops after a new live result', () => {
  jest.useFakeTimers();
  const restart = jest.fn();
  const subscription = useSubscription as jest.Mock;
  subscription.mockReturnValue({ error: new Error('closed'), restart });
  (useQuery as jest.Mock).mockReturnValue({ data: { things: [] } });
  const hook = renderHook(() => useLiveQuery(WATCH, GET));
  act(() => { jest.advanceTimersByTime(30_000); });
  expect(restart).toHaveBeenCalledTimes(1);
  subscription.mockReturnValue({ loading: true, restart });
  hook.rerender();
  expect(hook.result.current.live).toBe(false);
  subscription.mockReturnValue({ data: { things: ['fresh'] }, restart });
  hook.rerender();
  expect(hook.result.current.live).toBe(true);
  expect(useQuery).toHaveBeenLastCalledWith(GET, expect.objectContaining({ skip: true, pollInterval: 0 }));
  act(() => { jest.advanceTimersByTime(30_000); });
  expect(restart).toHaveBeenCalledTimes(1);
});

test('pauses a hidden page and subscribes again when visible', () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get');
  try {
    run({});
    visibility.mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(useSubscription).toHaveBeenLastCalledWith(WATCH, { variables, skip: true });
    expect(useQuery).toHaveBeenLastCalledWith(GET, expect.objectContaining({ skip: true }));
    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(useSubscription).toHaveBeenLastCalledWith(WATCH, { variables, skip: false });
  } finally {
    visibility.mockRestore();
  }
});

test('reads over the WebSocket and does not poll while the subscription works', () => {
  const result = run({ data: { things: [{ id: 'a' }] } });

  expect(result).toEqual({ data: { things: [{ id: 'a' }] }, loading: false, error: undefined, live: true });
  expect(useSubscription).toHaveBeenCalledWith(WATCH, { variables, skip: false });
  expect(useQuery).toHaveBeenCalledWith(GET, expect.objectContaining({ variables, skip: true, pollInterval: 0 }));
});

test('polls the HTTP query after the subscription fails', () => {
  const result = run(
    { error: new Error('WebSocket closed') },
    { data: { things: [] } },
  );

  expect(result).toEqual({ data: { things: [] }, loading: false, error: undefined, live: false });
  expect(useQuery).toHaveBeenCalledWith(
    GET, expect.objectContaining({ variables, skip: false, pollInterval: LIVE_FALLBACK_POLL_MS }),
  );
});

test('reports an error only when the polling fallback fails too', () => {
  const failure = new Error('field "things" not found');
  const result = run({ error: new Error('closed') }, { error: failure });

  expect(result.error).toBe(failure);
  expect(result.live).toBe(false);
});

test('keeps the last live result while the fallback loads', () => {
  const result = run({ data: { things: [{ id: 'a' }] }, error: new Error('closed') }, { loading: true });

  expect(result.data).toEqual({ things: [{ id: 'a' }] });
  expect(result.loading).toBe(false);
});

test('neither subscribes nor polls when skipped', () => {
  const result = run({}, {}, true);

  expect(result).toEqual({ data: undefined, loading: false, error: undefined, live: false });
  expect(useSubscription).toHaveBeenCalledWith(WATCH, { variables, skip: true });
  expect(useQuery).toHaveBeenCalledWith(GET, expect.objectContaining({ skip: true, pollInterval: 0 }));
});
