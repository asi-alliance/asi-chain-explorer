import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdvancedSearch from './AdvancedSearch';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const address = '1111x5QCpTeTXakyVzda9zAVyo6vnSG2WTd9TJ3n93LmMYRhzZouR';
const block = {
  block_number: '42',
  block_hash: 'ab'.repeat(32),
  proposer: 'validator',
  timestamp: '1700000000000',
};

function clientWith(link: ApolloLink) {
  return new ApolloClient({ cache: new InMemoryCache(), link });
}

async function search(text: string, data: any = { blocks: [], transfers: [], deployments: [] }) {
  const requests: any[] = [];
  const client = clientWith(new ApolloLink(operation => {
    requests.push(operation.variables);
    return Observable.of({ data });
  }));
  const view = render(
    <ApolloProvider client={client}>
      <MemoryRouter><AdvancedSearch /></MemoryRouter>
    </ApolloProvider>
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: text } });
  await waitFor(() => expect(requests).toHaveLength(1));
  // The input keeps exactly what was typed.
  expect(input).toHaveValue(text);
  view.unmount();
  return requests[0] as { pattern: string; height: string };
}

test.each([
  ['9007199254740991'],
  ['9007199254740993'],
  ['9223372036854775807'],
  ['42'],
  ['0'],
])('sends exact height %s without Number rounding (issue #62)', async text => {
  const variables = await search(text);
  expect(variables.height).toBe(text);
  expect(variables.pattern).toBe(`%${text}%`);
});

test('rejects out-of-range heights instead of substituting another block', async () => {
  const variables = await search('9223372036854775808');
  expect(variables.height).toBe('-1');
  expect(variables.pattern).toBe('%9223372036854775808%');
});

test('keeps leading zeros for text matches while querying the canonical height', async () => {
  const variables = await search('0012');
  expect(variables.height).toBe('12');
  expect(variables.pattern).toBe('%0012%');
});

test.each(['1e3', '0x12', '1.5', '-1', 'abc123'])('treats %p as text, not a coerced height', async text => {
  const variables = await search(text);
  expect(variables.height).toBe('-1');
  expect(variables.pattern).toBe(`%${text}%`);
});

test('escapes LIKE wildcards instead of matching every row', async () => {
  const variables = await search('a%b_c');
  expect(variables.pattern).toBe('%a\\%b\\_c%');
});

test('shows grouped results, de-duplicates one deploy, and links to the full search', async () => {
  const deployId = 'deploy-1';
  const client = clientWith(new ApolloLink(() => Observable.of({ data: {
    blocks: [block],
    deployments: [{ deploy_id: deployId, block_number: '42', timestamp: '1700000000000',
      deployer: 'key', deployer_address: address, errored: false }],
    transfers: [{ id: '7', deploy_id: deployId, block_number: '42', timestamp: '1700000000000',
      from_address: address, to_address: '1111recipient', amount_asi: '5', status: 'success' }],
  } })));
  render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: deployId } });

  const listbox = await screen.findByRole('listbox');
  const options = within(listbox).getAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options.map(option => option.textContent)).toEqual([
    expect.stringContaining('Block #42'),
    expect.stringContaining('Transaction deploy-1'),
  ]);
  expect(screen.getByRole('link', { name: 'See all results' }))
    .toHaveAttribute('href', `/search?q=${deployId}`);
});

test('a full wallet address opens the address page without querying Hasura', async () => {
  const requests: any[] = [];
  const client = clientWith(new ApolloLink(operation => {
    requests.push(operation.variables);
    return Observable.of({ data: { blocks: [], transfers: [], deployments: [] } });
  }));
  render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: address } });

  expect(await screen.findByRole('link', { name: /Wallet address/ }))
    .toHaveAttribute('href', `/address/${encodeURIComponent(address)}`);
  expect(requests).toHaveLength(0);
});

test('keyboard navigation opens the first result', async () => {
  const client = clientWith(new ApolloLink(() => Observable.of({ data: {
    blocks: [block], transfers: [], deployments: [],
  } })));
  render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AdvancedSearch />} />
          <Route path="/block/hash/:blockHash" element={<p>block page</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>
  );
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: '42' } });
  await screen.findByRole('listbox');

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByText('block page')).toBeInTheDocument();
});

test('clicking outside closes an open panel', async () => {
  const client = clientWith(new ApolloLink(() => Observable.of({ data: {
    blocks: [block], transfers: [], deployments: [],
  } })));
  render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '42' } });
  await screen.findByRole('listbox');

  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('reports an HTTP-200 GraphQL error envelope instead of "No results"', async () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const client = clientWith(new ApolloLink(() => Observable.of({ errors: [{ message: 'statement timeout' } as any] })));
    render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '42' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Search is temporarily unavailable.');
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});
