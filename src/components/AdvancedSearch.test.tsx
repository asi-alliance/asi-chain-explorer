import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdvancedSearch from './AdvancedSearch';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

function collect(filter: any, field: string, found: any[] = []): any[] {
  if (Array.isArray(filter)) filter.forEach(part => collect(part, field, found));
  else if (filter && typeof filter === 'object') {
    Object.entries(filter).forEach(([key, value]) => key === field ? found.push(value) : collect(value, field, found));
  }
  return found;
}

async function search(text: string) {
  const requests: any[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(operation => {
      requests.push(operation.variables);
      return Observable.of({ data: { blocks: [], transfers: [], deployments: [] } });
    }),
  });
  const view = render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
  fireEvent.change(screen.getByPlaceholderText(/Search blocks/), { target: { value: text } });
  await waitFor(() => expect(requests).toHaveLength(1));
  // The input keeps exactly what was typed.
  expect(screen.getByPlaceholderText(/Search blocks/)).toHaveValue(text);
  view.unmount();
  const variables = requests[0];
  return {
    heights: collect(variables.blocks_where, 'block_number'),
    blockText: collect(variables.blocks_where, 'block_hash'),
    transferText: collect(variables.transfers_where, 'deploy_id'),
    deploymentText: collect(variables.deployments_where, 'deploy_id'),
  };
}

test.each([
  ['9007199254740991'],
  ['9007199254740993'],
  ['9223372036854775807'],
  ['42'],
  ['0'],
])('sends exact height %s without Number rounding (issue #62)', async text => {
  const result = await search(text);
  expect(result.heights).toEqual([{ _eq: text }]);
  expect(result.blockText).toEqual([]);
  expect(result.transferText).toEqual([{ _ilike: `%${text}%` }]);
  expect(result.deploymentText).toEqual([{ _ilike: `%${text}%` }]);
});

test('rejects out-of-range heights instead of substituting another block', async () => {
  const result = await search('9223372036854775808');
  expect(result.heights).toEqual([]);
  expect(result.blockText).toEqual([{ _ilike: '%9223372036854775808%' }]);
});

test('keeps leading zeros for text matches while querying the canonical height', async () => {
  const result = await search('0012');
  expect(result.heights).toEqual([{ _eq: '12' }]);
  expect(result.transferText).toEqual([{ _ilike: '%0012%' }]);
  expect(result.deploymentText).toEqual([{ _ilike: '%0012%' }]);
});

test.each(['1e3', '0x12', '1.5', '-1', 'abc123'])('treats %p as text, not a coerced height', async text => {
  const result = await search(text);
  expect(result.heights).toEqual([]);
  expect(result.blockText).toEqual([{ _ilike: `%${text}%` }]);
  expect(result.deploymentText).toEqual([{ _ilike: `%${text}%` }]);
});

test('reports an HTTP-200 GraphQL error envelope instead of "No results"', async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(() => Observable.of({ errors: [{ message: 'statement timeout' } as any] })),
  });
  render(<ApolloProvider client={client}><MemoryRouter><AdvancedSearch /></MemoryRouter></ApolloProvider>);
  fireEvent.change(screen.getByPlaceholderText(/Search blocks/), { target: { value: '42' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Search failed: statement timeout');
  expect(screen.queryByText(/No results found/)).not.toBeInTheDocument();
});
