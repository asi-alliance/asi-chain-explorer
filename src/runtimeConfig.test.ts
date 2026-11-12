import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigError, resolvePublicConfig } from './runtimeConfig';

const ORIGIN = 'https://explorer.example.test/blocks';
const PRODUCTION = {};

function problems(runtime: object | undefined, build: object = {}): string[] {
  try {
    resolvePublicConfig(runtime, build, ORIGIN, PRODUCTION);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error('configuration was accepted');
}

test('uses the runtime endpoints over the build values (issue #60)', () => {
  const config = resolvePublicConfig(
    {
      REACT_APP_GRAPHQL_URL: 'https://hasura.example.test/v1/graphql',
      REACT_APP_GRAPHQL_WS_URL: 'wss://hasura.example.test/v1/graphql',
      REACT_APP_RCHAIN_NODE_URL: 'https://node.example.test:40453',
    },
    { REACT_APP_GRAPHQL_URL: 'http://build.example.test/v1/graphql', REACT_APP_GRAPHQL_WS_URL: 'ws://build.example.test/v1/graphql' },
    ORIGIN,
    PRODUCTION,
  );
  expect(config).toEqual({
    graphqlUrl: 'https://hasura.example.test/v1/graphql',
    graphqlWsUrl: 'wss://hasura.example.test/v1/graphql',
    indexerApiUrl: '/api/indexer',
    nodeUrl: 'https://node.example.test:40453',
  });
});

test('falls back to build values when the runtime file sets nothing', () => {
  const config = resolvePublicConfig(
    { REACT_APP_GRAPHQL_URL: '', REACT_APP_GRAPHQL_WS_URL: '' },
    { REACT_APP_GRAPHQL_URL: 'http://build.example.test/v1/graphql', REACT_APP_GRAPHQL_WS_URL: 'ws://build.example.test/v1/graphql' },
    ORIGIN,
    PRODUCTION,
  );
  expect(config.graphqlUrl).toBe('http://build.example.test/v1/graphql');
  expect(config.graphqlWsUrl).toBe('ws://build.example.test/v1/graphql');
});

test('a production bundle without endpoints is rejected instead of using localhost', () => {
  expect(problems(undefined)).toEqual([
    'REACT_APP_GRAPHQL_URL is not set',
    'REACT_APP_GRAPHQL_WS_URL is not set',
  ]);
});

test('development and test builds keep the local indexer defaults', () => {
  const config = resolvePublicConfig(undefined, {}, ORIGIN, {
    REACT_APP_GRAPHQL_URL: 'http://localhost:8080/v1/graphql',
    REACT_APP_GRAPHQL_WS_URL: 'ws://localhost:8080/v1/graphql',
  });
  expect(config.graphqlUrl).toBe('http://localhost:8080/v1/graphql');
});

test('same-origin paths are accepted and the subscription path follows the page scheme', () => {
  const config = resolvePublicConfig(
    { REACT_APP_GRAPHQL_URL: '/v1/graphql', REACT_APP_GRAPHQL_WS_URL: '/v1/graphql' },
    {},
    ORIGIN,
    PRODUCTION,
  );
  expect(config.graphqlUrl).toBe('/v1/graphql');
  expect(config.graphqlWsUrl).toBe('wss://explorer.example.test/v1/graphql');
});

test.each([
  ['REACT_APP_GRAPHQL_URL', 'ws://hasura.example.test/v1/graphql', /must use http or https/],
  ['REACT_APP_GRAPHQL_WS_URL', 'https://hasura.example.test/v1/graphql', /must use ws or wss/],
  ['REACT_APP_GRAPHQL_URL', 'javascript:alert(1)', /must use http or https/],
  ['REACT_APP_GRAPHQL_URL', 'https://evil.example.test/"};alert(1);//', /not allowed/],
  ['REACT_APP_GRAPHQL_URL', 'https://hasura.example.test/v1/graphql</script>', /not allowed/],
  ['REACT_APP_GRAPHQL_URL', 'https://hasura.example.test/v1 graphql', /not allowed/],
  ['REACT_APP_GRAPHQL_URL', 'https://admin:secret@hasura.example.test/v1/graphql', /credentials/],
  ['REACT_APP_GRAPHQL_URL', '//hasura.example.test/v1/graphql', /protocol-relative/],
  ['REACT_APP_GRAPHQL_URL', 'hasura.example.test/v1/graphql', /absolute/],
  ['REACT_APP_INDEXER_API_URL', 'ftp://indexer.example.test', /must use http or https/],
])('rejects %s=%p', (key, value, message) => {
  const runtime = {
    REACT_APP_GRAPHQL_URL: 'https://hasura.example.test/v1/graphql',
    REACT_APP_GRAPHQL_WS_URL: 'wss://hasura.example.test/v1/graphql',
    [key]: value,
  };
  const found = problems(runtime);
  expect(found).toHaveLength(1);
  expect(found[0]).toMatch(message);
});

// scripts/test-runtime-config.sh runs the container writer over the same table.
const SHARED_CASES = readFileSync(join(__dirname, '../scripts/runtime-config-cases.tsv'), 'utf8')
  .split('\n')
  .filter(line => line !== '' && !line.startsWith('#'))
  .map(line => line.split('\t'));

test('the shared case table is well formed', () => {
  expect(SHARED_CASES.length).toBeGreaterThan(30);
  SHARED_CASES.forEach(row => {
    expect(row).toHaveLength(3);
    expect(['accept', 'reject']).toContain(row[0]);
    expect(['http', 'ws']).toContain(row[1]);
  });
});

test.each(SHARED_CASES)('agrees with the container: %s %s endpoint %p', (verdict, kind, value) => {
  const runtime = {
    REACT_APP_GRAPHQL_URL: kind === 'http' ? value : 'https://hasura.example.test/v1/graphql',
    REACT_APP_GRAPHQL_WS_URL: kind === 'ws' ? value : 'wss://hasura.example.test/v1/graphql',
  };
  const resolve = () => resolvePublicConfig(runtime, {}, ORIGIN, PRODUCTION);
  if (verdict === 'accept') {
    expect(resolve).not.toThrow();
  } else {
    expect(resolve).toThrow(ConfigError);
  }
});

test.each(SHARED_CASES.filter(([verdict, , value]) => verdict === 'accept' && !value.startsWith('/')))(
  'an accepted %s %s endpoint is also a valid URL for the browser: %p',
  (_verdict, kind, value) => {
    const url = new URL(value);
    expect(kind === 'ws' ? ['ws:', 'wss:'] : ['http:', 'https:']).toContain(url.protocol);
    expect(url.username).toBe('');
    expect(url.password).toBe('');
  },
);
