import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SearchResultsPage from './SearchResultsPage';
import { defaultOptions } from '../apolloDefaults';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const blocks = Array.from({ length: 5025 }, (_, i) => ({
  block_hash: `hash${String(i).padStart(6, '0')}`, block_number: String(i),
  timestamp: String(1700000000000 + i), proposer: 'validator',
}));

function renderSearch(search: string, link: ApolloLink) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link });
  return render(<ApolloProvider client={client}><MemoryRouter initialEntries={[`/search?${search}`]}>
    <SearchResultsPage />
  </MemoryRouter></ApolloProvider>);
}

function fixture(search: string) {
  const requests: Array<{ limit: number; offset: number }> = [];
  renderSearch(search, new ApolloLink(operation => {
    const field = (operation.query.definitions[0] as any).selectionSet.selections
      .find((selection: any) => selection.name.value === 'blocks');
    const offsetArgument = field.arguments.find((argument: any) => argument.name.value === 'offset');
    const offset = offsetArgument ? operation.variables[offsetArgument.value.name.value] : 0;
    const { limit, order } = operation.variables;
    requests.push({ limit, offset });
    const sorted = order === 'asc' ? blocks : [...blocks].reverse();
    return Observable.of({ data: { blocks: sorted.slice(offset, offset + Math.min(limit, 5000)),
      transfers: [], deployments: [] } });
  }));
  return requests;
}

test('continues beyond the public 5000-row cap and supports previous-page navigation', async () => {
  const requests = fixture('q=hash&type=blocks&order=asc&page=250');
  await screen.findByRole('link', { name: 'Block #4980' });
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('link', { name: 'Block #5000' });
  expect(screen.getAllByRole('link')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('link', { name: 'Block #5020' });
  expect(screen.getAllByRole('link')).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('link', { name: 'Block #5000' });
  expect(requests.every(request => request.limit <= 200)).toBe(true);
  expect(requests.some(request => request.offset === 5000)).toBe(true);
});

test('opens a deep-linked page beyond the public row cap', async () => {
  fixture('q=hash&type=blocks&order=desc&page=251');
  await screen.findByRole('link', { name: 'Block #24' });
  expect(screen.getAllByRole('link')).toHaveLength(20);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
});

test('mixed pages reuse cursors for Next/Previous and return to page one when options change', async () => {
  const requests: any[] = [];
  const data: Record<string, any[]> = {
    blocks: blocks.slice(0, 45), deployments: [],
    transfers: [0, 1].map(i => ({ id: String(i + 1), deploy_id: `transfer${i}`,
      timestamp: blocks[i].timestamp, from_address: 'a', to_address: 'b',
      status: 'success', amount_asi: '1' })),
  };
  function matches(row: any, filter: any): boolean {
    if (filter._and) return filter._and.every((part: any) => matches(row, part));
    if (filter._or) return filter._or.some((part: any) => matches(row, part));
    return Object.entries(filter).every(([field, operators]) =>
      Object.entries(operators as object).every(([operator, expected]) => {
        // The fixture matches either search term; evaluate the actual continuation filters.
        if (operator === '_ilike') return true;
        const value = field === 'timestamp' ? BigInt(row[field]) : row[field];
        const boundary = field === 'timestamp' ? BigInt(expected as string) : expected;
        return operator === '_eq' ? value === boundary : operator === '_gt' ? value > boundary : value < boundary;
      }));
  }
  renderSearch('q=hash&type=all&order=asc&page=2', new ApolloLink(operation => {
    const variables = operation.variables;
    requests.push(variables);
    return Observable.of({ data: Object.fromEntries(Object.entries(data).map(([stream, rows]) => {
      const sorted = variables.order === 'asc' ? rows : [...rows].reverse();
      return [stream, sorted.filter(row => matches(row, variables[stream]))
        .slice(variables.offset, variables.offset + variables.limit)];
    })) });
  }));
  await screen.findByRole('link', { name: 'Block #18' });
  requests.length = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('link', { name: 'Block #38' });
  expect(requests).toHaveLength(3);
  for (const [index, stream] of ['blocks', 'transfers', 'deployments'].entries()) {
    expect(requests[index]).toMatchObject({ offset: 0, limit: 200 });
    expect(requests[index][stream]._and).toHaveLength(2);
  }
  requests.length = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByRole('link', { name: 'Block #18' });
  expect(requests).toHaveLength(3);
  expect(requests[0].blocks._and).toHaveLength(2);

  requests.length = 0;
  fireEvent.change(screen.getByLabelText('Result order'), { target: { value: 'desc' } });
  await screen.findByRole('link', { name: 'Block #44' });
  expect(requests).toHaveLength(3);
  expect(requests[0].blocks._and).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('link', { name: 'Block #24' });
  requests.length = 0;
  const input = screen.getByLabelText('Block height or hash, deploy ID, or address');
  fireEvent.change(input, { target: { value: 'new' } });
  fireEvent.submit(input.closest('form')!);
  await screen.findByRole('link', { name: 'Block #44' });
  expect(requests).toHaveLength(3);
  expect(requests[0].blocks._and).toBeUndefined();
  expect(requests[0].blocks._or[0].block_hash._ilike).toBe('%new%');
});

test('changing query cancels a pending page and ignores its late response', async () => {
  let completeOld: () => void = () => {};
  let oldSignal: AbortSignal | undefined;
  const requests: number[] = [];
  renderSearch('q=old&type=blocks&page=251', new ApolloLink(operation => new Observable(observer => {
    requests.push(operation.variables.offset);
    if (operation.variables.blocks._or[0].block_hash._ilike === '%old%') {
      oldSignal = operation.getContext().fetchOptions.signal;
      completeOld = () => {
        observer.next({ data: { blocks: [blocks[5000]], transfers: [], deployments: [] } });
        observer.complete();
      };
    } else {
      observer.next({ data: { blocks: [blocks[42]], transfers: [], deployments: [] } });
      observer.complete();
    }
  })));
  await waitFor(() => expect(oldSignal).toBeDefined());
  const input = screen.getByLabelText('Block height or hash, deploy ID, or address');
  fireEvent.change(input, { target: { value: 'new' } });
  fireEvent.submit(input.closest('form')!);
  await screen.findByRole('link', { name: 'Block #42' });
  expect(oldSignal!.aborted).toBe(true);
  expect(requests).toEqual([5000, 0]);
  await act(async () => { completeOld(); });
  expect(screen.queryByRole('link', { name: 'Block #5000' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Block #42' })).toBeInTheDocument();
});

test('filter/order changes reset pagination and clearing the query clears old rows', async () => {
  const requests: any[] = [];
  renderSearch('q=hash&type=blocks&page=251', new ApolloLink(operation => {
    requests.push(operation.variables);
    const transferOnly = operation.variables.transfers._or.length > 0;
    return Observable.of({ data: {
      blocks: transferOnly ? [] : [blocks[operation.variables.offset]],
      transfers: transferOnly ? [{ id: '9007199254740993', deploy_id: 'exact-transfer',
        timestamp: '1700000000000', from_address: 'a', to_address: 'b', status: 'success',
        amount_asi: '18446744073709551616.000000000000000001' }] : [], deployments: [],
    } });
  }));
  await screen.findByRole('link', { name: 'Block #5000' });
  fireEvent.change(screen.getByLabelText('Result order'), { target: { value: 'asc' } });
  await screen.findByRole('link', { name: 'Block #0' });
  expect(requests.at(-1)).toMatchObject({ order: 'asc', offset: 0 });
  fireEvent.change(screen.getByLabelText('Result type'), { target: { value: 'transfers' } });
  const link = await screen.findByRole('link', { name: '18446744073709551616.000000000000000001 ASI Transfer' });
  expect(link).toHaveAttribute('href', '/transaction/exact-transfer');
  expect(requests.at(-1).blocks).toEqual({ _or: [] });
  const requestCount = requests.length;
  const input = screen.getByLabelText('Block height or hash, deploy ID, or address');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.submit(input.closest('form')!);
  expect(screen.getByText('Enter a query to search the indexed chain.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(requests).toHaveLength(requestCount);
});

test('shows request failures without retaining the previous results', async () => {
  let request = 0;
  renderSearch('q=hash&type=blocks&order=asc', new ApolloLink(() => new Observable(observer => {
    if (request++ === 0) {
      observer.next({ data: { blocks: blocks.slice(0, 21), transfers: [], deployments: [] } });
      observer.complete();
    } else observer.error(new Error('backend unavailable'));
  })));
  await screen.findByRole('link', { name: 'Block #0' });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('backend unavailable');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

describe('with the production Apollo default options (PR #58 review)', () => {
  const graphQLError = { message: 'canceling statement due to statement timeout' };
  function renderWithDefaults(search: string, result: object) {
    const client = new ApolloClient({ cache: new InMemoryCache(), defaultOptions,
      link: new ApolloLink(() => Observable.of(result)) });
    return render(<ApolloProvider client={client}><MemoryRouter initialEntries={[`/search?${search}`]}>
      <SearchResultsPage />
    </MemoryRouter></ApolloProvider>);
  }

  test.each([
    ['filtered search without data', 'q=hash&type=blocks', { errors: [graphQLError] }],
    ['mixed search without data', 'q=hash&type=all', { errors: [graphQLError] }],
    ['partial data with errors', 'q=hash&type=all',
      { data: { blocks: blocks.slice(0, 3), transfers: null, deployments: [] }, errors: [graphQLError] }],
  ])('reports an HTTP-200 GraphQL error envelope for %s', async (_name, search, result) => {
    renderWithDefaults(search, result);
    expect(await screen.findByRole('alert')).toHaveTextContent('statement timeout');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/No results/i)).not.toBeInTheDocument();
  });
});
