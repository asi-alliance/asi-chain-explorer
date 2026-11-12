import { gql } from '@apollo/client';
import { createClient } from 'graphql-ws';
import { createApolloClient } from './apollo-client';

jest.mock('graphql-ws', () => ({
  createClient: jest.fn(() => ({ subscribe: jest.fn(), on: jest.fn(), dispose: jest.fn(), terminate: jest.fn() })),
}));

const CONFIG = {
  graphqlUrl: 'https://hasura.example.test/v1/graphql',
  graphqlWsUrl: 'wss://hasura.example.test/v1/graphql',
};

const savedEnv = { ...process.env };
const savedFetch = global.fetch;

afterEach(() => {
  process.env = { ...savedEnv };
  global.fetch = savedFetch;
});

test('queries the configured endpoint without admin or bearer credentials (issue #60)', async () => {
  // Legacy variables that used to be sent from the browser are ignored.
  process.env.REACT_APP_HASURA_ADMIN_SECRET = 'example-admin-secret';
  process.env.REACT_APP_AUTH_TOKEN = 'example-token';
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ data: { blocks: [] } }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;

  const client = createApolloClient(CONFIG);
  await client.query({ query: gql`query Probe { blocks { block_hash } }` });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(CONFIG.graphqlUrl);
  const headers = Object.keys(init.headers as Record<string, string>).map(name => name.toLowerCase());
  expect(headers).not.toContain('x-hasura-admin-secret');
  expect(headers).not.toContain('authorization');
});

test('opens subscriptions on the configured WebSocket endpoint without connection credentials', () => {
  createApolloClient(CONFIG);
  const calls = (createClient as jest.Mock).mock.calls;
  const options = calls[calls.length - 1][0];
  expect(options.url).toBe(CONFIG.graphqlWsUrl);
  expect(options.connectionParams).toBeUndefined();
});
