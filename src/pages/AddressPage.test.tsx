import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { render, fireEvent, screen } from '@testing-library/react';
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

function show(path: string, transfers: object[] = []) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(() => Observable.of({ data: { transfers } })),
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
  expect(await screen.findByText('No transfers found.')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/indexer/address/' + address, expect.anything());
});

test('a failed balance read preserves indexed history', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 503 });
  show('/address/' + address, [{ id: '1', deploy_id: 'aa', from_address: address, to_address: address,
    amount_asi: '0.000000000000000001', block_number: 123 }]);
  expect(await screen.findByRole('alert')).toHaveTextContent('Balance unavailable');
  expect(await screen.findByText('0.000000000000000001 ASI')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View transaction' })).toHaveAttribute('href', '/transaction/aa');
});
