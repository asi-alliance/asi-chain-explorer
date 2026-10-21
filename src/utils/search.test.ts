import { searchResults, searchVariables } from './search';

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
