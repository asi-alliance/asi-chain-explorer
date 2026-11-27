import type { PropsWithChildren } from 'react';
import { ApolloProvider } from '@apollo/client';
import { CloseCode } from 'graphql-ws';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createApolloClient } from './apollo-client';
import { PendingDeploysStatusProvider, usePendingDeploysStatus } from './hooks/usePendingDeploysStatus';
import { pendingStatusRows } from './testing/apolloOperations';

// CRA's Jest resolver selects the ESM entry. Use the same client in its CommonJS build.
jest.mock('graphql-ws', () => jest.requireActual('graphql-ws/dist/client.cjs'));

test('falls back to HTTP when an open socket never acknowledges connection_init', async () => {
  let socket: SilentSocket;
  class SilentSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = SilentSocket.OPEN;
    onopen?: () => void;
    onclose?: (event: CloseEvent) => void;
    send = jest.fn();
    close = jest.fn((code: number, reason: string) => {
      this.readyState = SilentSocket.CLOSED;
      this.onclose?.(new CloseEvent('close', { code, reason }));
    });

    constructor() { socket = this; }
  }

  jest.useFakeTimers();
  const originalSocket = global.WebSocket;
  const originalFetch = global.fetch;
  const http = jest.fn(async () => ({
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ data: { indexer_state: pendingStatusRows() } }),
  }));
  Object.assign(global, { WebSocket: SilentSocket, fetch: http });
  const client = createApolloClient({
    graphqlUrl: 'https://example.test/v1/graphql',
    graphqlWsUrl: 'wss://example.test/v1/graphql',
  });
  const { result, unmount } = renderHook(usePendingDeploysStatus, {
    wrapper: ({ children }: PropsWithChildren) => (
      <ApolloProvider client={client}><PendingDeploysStatusProvider>{children}</PendingDeploysStatusProvider></ApolloProvider>
    ),
  });
  try {
    await act(async () => { socket.onopen?.(); });
    expect(socket!.send).toHaveBeenCalledWith(JSON.stringify({ type: 'connection_init' }));
    await act(async () => { jest.advanceTimersByTime(4_999); });
    expect(http).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(socket!.close).toHaveBeenCalledWith(CloseCode.ConnectionAcknowledgementTimeout, expect.any(String));
    await waitFor(() => expect(result.current.status?.nodes).toBe(3));
    expect(http).toHaveBeenCalledTimes(1);
    expect(result.current.live).toBe(false);
  } finally {
    unmount();
    client.stop();
    Object.assign(global, { WebSocket: originalSocket, fetch: originalFetch });
    jest.useRealTimers();
  }
});
