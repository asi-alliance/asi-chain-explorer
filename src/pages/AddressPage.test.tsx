import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { act, render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdvancedSearch from '../components/AdvancedSearch';
import AddressPage from './AddressPage';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});

const address = '1111x5QCpTeTXakyVzda9zAVyo6vnSG2WTd9TJ3n93LmMYRhzZouR';
const hash = 'ab'.repeat(32);
const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { global.fetch = originalFetch; });

function show(path: string, transfers: { id: string; [key: string]: unknown }[] = [],
  cursor: string | null = '7294', link?: ApolloLink) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: link ?? new ApolloLink(({ operationName }) => Observable.of({ data: operationName === 'AddressHistoryBounds'
      ? { newest: transfers.slice(0, 1).map(({ id }) => ({ id })), indexer_state: cursor === null ? [] : [{ value: cursor }] }
      : { transfers } })),
  });
  return render(<ApolloProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/" element={<AdvancedSearch />} />
      <Route path="/address/:address" element={<AddressPage />} /></Routes>
  </MemoryRouter></ApolloProvider>);
}

test.each(['Enter', 'click'])('full address opens its balance without indexed transfers (%s)', async action => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({
    address, balance: '20001000000000000000001', token_decimals: 18, block_hash: hash, block_number: 7294,
  }) });
  show('/');
  const input = screen.getByPlaceholderText(/Search blocks/);
  fireEvent.change(input, { target: { value: address } });
  if (action === 'Enter') fireEvent.keyDown(input, { key: 'Enter' });
  else fireEvent.click(screen.getByRole('button', { name: 'View wallet address' }));
  expect(await screen.findByText('20001.000000000000000001 ASI')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '#7294' })).toHaveAttribute('href', '/block/hash/' + hash);
  expect(await screen.findByText('No indexed transfers found.')).toBeInTheDocument();
  expect(screen.getByText('Indexed through block #7294.')).toBeInTheDocument();
  expect(screen.queryByText(/behind the balance/)).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/indexer/address/' + address, expect.anything());
});

test('a malformed transfer amount preserves the finalized balance', async () => {
  fetchMock.mockResolvedValue(balanceResponse('42', 7294, hash));
  show('/address/' + address, [{ ...transfer(1, 7294), amount_asi: 0.5 }]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Transfer history unavailable.');
  expect(await screen.findByText('42 ASI')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '#7294' })).toHaveAttribute('href', '/block/hash/' + hash);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('a failed balance read preserves indexed history', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  show('/address/' + address, [{ id: '1', deploy_id: 'aa', from_address: address, to_address: address,
    amount_asi: '0.000000000000000001', block_number: 123 }]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Balance unavailable');
  expect(await screen.findByText('0.000000000000000001 ASI')).toBeInTheDocument();
  expect(screen.getByText('Indexed through block #7294.')).toBeInTheDocument();
  expect(screen.queryByText(/behind the balance/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View transaction' })).toHaveAttribute('href', '/transaction/aa');
});

test.each([
  ['7290', 'Indexed through block #7290.', 'History is 4 blocks behind the balance.'],
  ['7293', 'Indexed through block #7293.', 'History is 1 block behind the balance.'],
  ['0', 'Indexed through block #0.', 'History is 7294 blocks behind the balance.'],
  ['7295', 'Indexed through block #7295.', null],
  [null, 'Indexed height unavailable.', null],
  ['-1', 'Indexed height unavailable.', null],
  ['invalid', 'Indexed height unavailable.', null],
])('compares the history checkpoint %s with the displayed balance block', async (cursor, label, warning) => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({
    address, balance: '0', token_decimals: 18, block_hash: hash, block_number: 7294,
  }) });
  show('/address/' + address, [], cursor);
  expect(await screen.findByText('0 ASI')).toBeInTheDocument();
  expect(await screen.findByText(label!)).toBeInTheDocument();
  if (warning) expect(await screen.findByText(warning, { exact: false })).toBeInTheDocument();
  else expect(screen.queryByText(/behind the balance/)).not.toBeInTheDocument();
});

type HistoryRow = ReturnType<typeof transfer>;
function transfer(n: number, height: number, from = address, to = address) {
  return { id: String(9007199254740992n + BigInt(n)), deploy_id: String(n),
    block_number: String(height), from_address: from, to_address: to, amount_asi: '1' };
}

type Predicate = {
  _and?: Predicate[];
  _or?: Predicate[];
  id?: { _lt?: string; _lte?: string };
  block_number?: { _eq?: string; _lt?: string; _lte?: string };
  from_address?: { _eq: string };
  to_address?: { _eq: string };
};

function matches(row: HistoryRow, clause: Predicate): boolean {
  if (clause._and) return clause._and.every(item => matches(row, item));
  if (clause._or) return clause._or.some(item => matches(row, item));
  if (clause.from_address && row.from_address !== clause.from_address._eq) return false;
  if (clause.to_address && row.to_address !== clause.to_address._eq) return false;
  for (const column of ['id', 'block_number'] as const) {
    for (const [operator, value] of Object.entries(clause[column] ?? {})) {
      const actual = BigInt(row[column]);
      const limit = BigInt(value as string);
      if (operator === '_lt' && actual >= limit) return false;
      if (operator === '_lte' && actual > limit) return false;
      if (operator === '_eq' && actual !== limit) return false;
    }
  }
  return true;
}

function historySource(rows: HistoryRow[], height: () => string) {
  const boundsRead = jest.fn(() => ({ newest: [{ id: rows[rows.length - 1].id }], indexer_state: [{ value: height() }] }));
  const link = new ApolloLink(({ operationName, variables }) => {
    if (operationName === 'AddressHistoryBounds') return Observable.of({ data: boundsRead() });
    const visible = rows.filter(row => matches(row, variables.where)).sort((a, b) =>
      Number(b.block_number) - Number(a.block_number) || Number(BigInt(b.id) - BigInt(a.id)));
    return Observable.of({ data: { transfers: visible.slice(0, variables.limit) } });
  });
  return { link, boundsRead };
}

test('keeps a stable cursor across inserts, back navigation and changes of direction', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  const other = 'another-address';
  const rows = Array.from({ length: 23 }, (_, i) => transfer(i + 1, i === 0 ? 9 : 10,
    i % 2 === 0 ? address : other, i % 2 === 0 && i !== 0 ? other : address));
  rows.push(transfer(24, 11), transfer(25, 9, other, other));
  const { link, boundsRead } = historySource(rows, () => '10');
  show('/address/' + address, [], null, link);
  const ids = async () => (await screen.findAllByRole('link', { name: 'View transaction' }))
    .map(el => Number(el.getAttribute('href')!.split('/').pop()));
  const first = Array.from({ length: 20 }, (_, i) => 23 - i);
  expect(await ids()).toEqual(first);
  // Inserts above, at, and below the current page boundary.
  rows.push(transfer(26, 11), transfer(27, 10), transfer(28, 9));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await ids()).toEqual([3, 2, 1]);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(await ids()).toEqual(first);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await ids()).toEqual([3, 2, 1]);

  const direction = screen.getByRole('combobox', { name: 'Direction' });
  fireEvent.change(direction, { target: { value: 'incoming' } });
  expect(await ids()).toEqual([22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1]);
  fireEvent.change(direction, { target: { value: 'outgoing' } });
  expect(await ids()).toEqual([23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
  fireEvent.change(direction, { target: { value: 'all' } });
  expect(await ids()).toEqual(first);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(boundsRead).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

function balanceResponse(balance: string, height: number, blockHash: string) {
  return { ok: true, json: async () => ({
    address, balance, token_decimals: 0, block_hash: blockHash, block_number: height,
  }) };
}

test('refresh loads the new balance and first page with the selected direction', async () => {
  const other = 'another-address';
  const newHash = 'cd'.repeat(32);
  fetchMock.mockResolvedValueOnce(balanceResponse('100', 10, hash))
    .mockResolvedValueOnce(balanceResponse('110', 12, newHash));
  let height = '10';
  const rows = Array.from({ length: 21 }, (_, i) => transfer(i + 1, 10, other, address));
  const { link, boundsRead } = historySource(rows, () => height);
  show('/address/' + address, [], null, link);
  expect(await screen.findByText('100 ASI')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Direction' }), { target: { value: 'incoming' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'View transaction' })).toHaveAttribute('href', '/transaction/1');

  height = '11';
  rows.push(transfer(22, 11, other, address), transfer(23, 11, address, other));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('110 ASI')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '#12' })).toHaveAttribute('href', '/block/hash/' + newHash);
  expect(await screen.findByText('Indexed through block #11.')).toBeInTheDocument();
  expect(screen.getByText(/1 block behind the balance/)).toBeInTheDocument();
  expect(await screen.findByText('Page 1')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Direction' })).toHaveValue('incoming');
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  const links = screen.getAllByRole('link', { name: 'View transaction' });
  expect(links[0]).toHaveAttribute('href', '/transaction/22');
  expect(links.map(el => el.getAttribute('href'))).not.toContain('/transaction/23');
  expect(boundsRead).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('refresh supersedes in-flight balance and history reads', async () => {
  let finishBalance!: (response: ReturnType<typeof balanceResponse>) => void;
  fetchMock.mockReturnValueOnce(new Promise(resolve => { finishBalance = resolve; }))
    .mockResolvedValueOnce(balanceResponse('110', 12, hash));
  let finishHistory!: () => void;
  let requests = 0;
  const link = new ApolloLink(() => new Observable(observer => {
    const finish = (value: string) => {
      observer.next({ data: { newest: [], indexer_state: [{ value }] } });
      observer.complete();
    };
    if (++requests === 1) finishHistory = () => finish('10');
    else finish('12');
  }));
  show('/address/' + address, [], null, link);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('110 ASI')).toBeInTheDocument();
  expect(await screen.findByText('Indexed through block #12.')).toBeInTheDocument();
  await act(async () => {
    finishBalance(balanceResponse('100', 10, hash));
    finishHistory();
  });
  expect(screen.getByText('110 ASI')).toBeInTheDocument();
  expect(screen.getByText('Indexed through block #12.')).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
