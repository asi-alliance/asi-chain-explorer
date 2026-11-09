import { loadSearchPage, SearchCheckpoints, SearchCursor, SearchResult, SearchStream, searchResults, searchVariables } from './search';

test('searches deploy IDs and both addresses with exact precision', () => {
  const variables = searchVariables('1111abc', 20, 'desc', 'all');
  expect(JSON.stringify(variables)).toContain('deployer_address');
  expect(JSON.stringify(variables)).toContain('from_address');
  expect(JSON.stringify(variables)).toContain('to_address');
  const results = searchResults({ transfers: [{ id: '9007199254740993', deploy_id: 'sig',
    from_address: 'a', to_address: 'b', amount_asi: '18446744073709551616.000000000000000001', timestamp: 1, status: 'success' }] }, 'desc');
  expect(results[0].title).toBe('18446744073709551616.000000000000000001 ASI Transfer');
  expect(results[0].path).toBe('/transaction/sig');
});

test('numeric heights are bounded and literal wildcard searches are escaped', () => {
  expect(JSON.stringify(searchVariables('0', 20, 'desc', 'blocks'))).toContain('"_eq":"0"');
  expect(JSON.stringify(searchVariables('9223372036854775808', 20, 'desc', 'all'))).not.toContain('block_number');
  expect(searchVariables('a%b_c', 20, 'desc', 'blocks').blocks).toEqual({ _or: [
    {block_hash: {_ilike: '%a\\%b\\_c%'}}, {proposer: {_ilike: '%a\\%b\\_c%'}}] });
  expect(searchResults(undefined, 'desc')).toEqual([]);
});

test('DAG siblings keep hash identity and page ordering is stable for equal timestamps', () => {
  const results = searchResults({ blocks: ['b', 'a'].map(block_hash => ({block_hash, block_number: 1, timestamp: 1})),
    transfers: ['10','2'].map(id => ({id, deploy_id: id, timestamp: 1, amount_asi: '0.000000000000000001'})) }, 'desc');
  expect(results.map(r => r.path)).toEqual(['/block/hash/a', '/block/hash/b', '/transaction/2', '/transaction/10']);
});

const result = (type: SearchResult['type'], id: string, timestamp: number): SearchResult => ({
  type, id: `${type}:${id}`, title: id, description: id, path: `/${type}/${id}`, timestamp,
  data: { id, block_hash: id, deploy_id: id, timestamp: String(timestamp) },
});
const follows = (row: SearchResult, cursor: SearchCursor, order: 'asc' | 'desc') => {
  if (row.timestamp !== Number(cursor.timestamp)) return order === 'asc'
    ? row.timestamp > Number(cursor.timestamp) : row.timestamp < Number(cursor.timestamp);
  if (row.type !== cursor.type) return row.type > cursor.type;
  return row.type === 'transfer' ? BigInt(row.data.id) > BigInt(cursor.id) : row.data.id > cursor.id;
};
const streamReader = (streams: Record<SearchStream, SearchResult[]>, order: 'asc' | 'desc' = 'asc') => jest.fn(
  async (stream: SearchStream, offset: number, limit: number, cursor?: SearchCursor) =>
    streams[stream].filter(row => !cursor || follows(row, cursor, order)).slice(offset, offset + Math.min(limit, 5000)),
);

test.each(['asc', 'desc'] as const)('merges all streams beyond 5000 rows each in %s order', async order => {
  const indices = Array.from({ length: 5050 }, (_, i) => i);
  if (order === 'desc') indices.reverse();
  const streams = { blocks: [] as SearchResult[], transfers: [] as SearchResult[], deployments: [] as SearchResult[] };
  const expected: SearchResult[] = [];
  for (const i of indices) {
    const block = result('block', `hash${i}`, i);
    const deployment = result('deployment', `deploy${i}`, i);
    const transfer = result('transfer', String(9007199254740993n + BigInt(i)), i);
    streams.blocks.push(block); streams.deployments.push(deployment); streams.transfers.push(transfer);
    expected.push(block, deployment, transfer);
  }
  const fetch = streamReader(streams, order);
  const page = await loadSearchPage(fetch, 751, order, 'all', new AbortController().signal);
  expect(page.rows).toEqual(expected.slice(15000, 15020));
  expect(page.hasMore).toBe(true);
  expect(fetch.mock.calls.every(([, , limit]) => limit <= 200)).toBe(true);
  for (const stream of ['blocks', 'transfers', 'deployments']) {
    expect(fetch.mock.calls.filter(([type, , , cursor]) => type === stream && cursor).length).toBeGreaterThanOrEqual(25);
  }
  expect(fetch.mock.calls.every(([, offset]) => offset === 0)).toBe(true);
});

test('retains equal-timestamp ordering across batches and exhausts uneven streams exactly', async () => {
  const blocks = Array.from({ length: 5010 }, (_, i) => result('block', `hash${String(i).padStart(6, '0')}`, 1));
  const deployments = [result('deployment', 'a', 1), result('deployment', 'b', 1)];
  const transfers = ['2', '10', '9007199254740993'].map(id => result('transfer', id, 1));
  const fetch = streamReader({ blocks, deployments, transfers }, 'desc');
  const page = await loadSearchPage(fetch, 251, 'desc', 'all', new AbortController().signal);
  expect(page.rows).toEqual([...blocks.slice(5000), ...deployments, ...transfers]);
  expect(page.hasMore).toBe(false);
  expect(await loadSearchPage(fetch, 252, 'desc', 'all', new AbortController().signal))
    .toEqual({ rows: [], hasMore: false });
});

test.each(['blocks', 'transfers', 'deployments'] as const)('requests a filtered %s page directly with bounded lookahead', async stream => {
  const fetch = jest.fn(async () => Array.from({ length: 21 }, (_, i) => result('block', String(i), i)));
  const page = await loadSearchPage(fetch, 251, 'asc', stream, new AbortController().signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(stream, 5000, 21);
  expect(page.rows).toHaveLength(20);
  expect(page.hasMore).toBe(true);
});

test.each([0, 20, 21])('detects the end correctly for %s merged results', async count => {
  const fetch = streamReader({ blocks: Array.from({ length: count }, (_, i) => result('block', String(i), i)),
    deployments: [], transfers: [] });
  const page = await loadSearchPage(fetch, 1, 'asc', 'all', new AbortController().signal);
  expect(page.rows).toHaveLength(Math.min(count, 20));
  expect(page.hasMore).toBe(count > 20);
});

test('fails the whole page when a later stream batch fails, rather than returning a partial result', async () => {
  const fetch = jest.fn(async (stream: SearchStream, offset: number, limit: number, cursor?: SearchCursor) => {
    if (stream !== 'blocks') return [];
    if (cursor) throw new Error('backend unavailable');
    return Array.from({ length: 200 }, (_, i) => result('block', String(i), i));
  });
  await expect(loadSearchPage(fetch, 11, 'asc', 'all', new AbortController().signal)).rejects.toThrow('backend unavailable');
});

test.each(['insert', 'delete'])('mixed-page traversal is stable when earlier rows %s during loading', async change => {
  const blocks = Array.from({ length: 1000 }, (_, i) => result('block', String(1000 - i), 1000 - i));
  const expected = blocks.slice(200, 220);
  let mutated = false;
  const fetch = jest.fn(async (stream: SearchStream, offset: number, limit: number, cursor?: SearchCursor) => {
    if (stream !== 'blocks') return [];
    const batch = blocks.filter(row => !cursor || follows(row, cursor, 'desc')).slice(offset, offset + limit);
    if (!mutated) {
      mutated = true;
      if (change === 'insert') blocks.unshift(result('block', '1001', 1001));
      else blocks.splice(50, 1);
    }
    return batch;
  });
  const page = await loadSearchPage(fetch, 11, 'desc', 'all', new AbortController().signal);
  expect(page.rows).toEqual(expected);
});

test('stops refilling streams after cancellation', async () => {
  const controller = new AbortController();
  const fetch = jest.fn(async (stream: SearchStream) => {
    await Promise.resolve();
    if (stream !== 'blocks') return [];
    controller.abort();
    return Array.from({ length: 200 }, (_, i) => result('block', String(i), i));
  });
  await expect(loadSearchPage(fetch, 251, 'asc', 'all', controller.signal)).rejects.toThrow('Search cancelled');
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('resumes Next and Previous from bounded global cursor checkpoints', async () => {
  const blocks = Array.from({ length: 5050 }, (_, i) => result('block', String(i).padStart(6, '0'), i));
  const fetch = streamReader({ blocks, deployments: [], transfers: [] });
  const checkpoints: SearchCheckpoints = new Map();
  const signal = new AbortController().signal;
  await loadSearchPage(fetch, 251, 'asc', 'all', signal, checkpoints);
  expect(checkpoints.size).toBeLessThanOrEqual(32);
  fetch.mockClear();
  const next = await loadSearchPage(fetch, 252, 'asc', 'all', signal, checkpoints);
  expect(next.rows).toEqual(blocks.slice(5020, 5040));
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every(([, offset, , cursor]) => offset === 0 && cursor?.timestamp === '5019')).toBe(true);
  fetch.mockClear();
  const previous = await loadSearchPage(fetch, 251, 'asc', 'all', signal, checkpoints);
  expect(previous.rows).toEqual(blocks.slice(5000, 5020));
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('a resumed mixed page excludes newly inserted rows preceding its global boundary', async () => {
  const blocks = Array.from({ length: 40 }, (_, i) => result('block', String(i).padStart(3, '0'), 100 - i));
  const transfers: SearchResult[] = [];
  const fetch = streamReader({ blocks, deployments: [], transfers }, 'desc');
  const checkpoints: SearchCheckpoints = new Map();
  const signal = new AbortController().signal;
  await loadSearchPage(fetch, 1, 'desc', 'all', signal, checkpoints);
  transfers.push(result('transfer', '9007199254740993', 101));
  const second = await loadSearchPage(fetch, 2, 'desc', 'all', signal, checkpoints);
  expect(second.rows).toEqual(blocks.slice(20));
  expect(second.hasMore).toBe(false);
});

test.each(['asc', 'desc'] as const)('cursor filters preserve %s timestamp direction and global type/ID ties', order => {
  const cursor: SearchCursor = { timestamp: '1700000000000', type: 'deployment', id: 'exact-id' };
  const timestamp = { timestamp: { [order === 'asc' ? '_gt' : '_lt']: cursor.timestamp } };
  const condition = (stream: SearchStream) => (searchVariables('needle', 200, order, stream, 0, cursor)[stream] as any)._and[1]._or;
  expect(condition('blocks')).toEqual([timestamp]);
  expect(condition('deployments')).toEqual([timestamp, { timestamp: { _eq: cursor.timestamp }, deploy_id: { _gt: cursor.id } }]);
  expect(condition('transfers')).toEqual([timestamp, { timestamp: { _eq: cursor.timestamp } }]);
  const numeric = searchVariables('needle', 200, order, 'transfers', 0,
    { ...cursor, type: 'transfer', id: '9007199254740993' }) as any;
  expect(numeric.transfers._and[1]._or[1].id._gt).toBe('9007199254740993');
});
