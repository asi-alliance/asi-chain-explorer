import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AddressPage from './AddressPage';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});

jest.mock('../runtimeConfig', () => ({
  ...jest.requireActual('../runtimeConfig'),
  getPublicConfig: () => ({ indexerApiUrl: '/api/indexer' }),
}));

jest.mock('../components/AddressPendingDeploys', () => () => null);

const addressA = '1111x5QCpTeTXakyVzda9zAVyo6vnSG2WTd9TJ3n93LmMYRhzZouR';
const addressB = '1111Ld3zPB4mqJKttJjciXJ2VDib8ac18ioSHpaSzBvKnzTU9N51e';
const hash = 'ab'.repeat(32);
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { global.fetch = originalFetch; });

function balance(address: string, amount: string) {
  return { ok: true, json: async () => ({
    address, balance: amount, token_decimals: 0, block_hash: hash, block_number: 10,
  }) };
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Go back</button>;
}

function show() {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(({ operationName }) => Observable.of({
      data: operationName === 'AddressHistoryBounds'
        ? { newest: [{ id: '1' }], indexer_state: [{ value: '10' }] }
        : { transfers: [{
          id: '1', deploy_id: '1', block_number: '10',
          from_address: addressA, to_address: addressB, amount_asi: '1',
        }] },
    })),
  });
  return render(<ApolloProvider client={client}><MemoryRouter initialEntries={['/address/' + addressA]}>
    <Routes><Route path="/address/:address" element={<AddressPage />} /></Routes>
    <BackButton />
  </MemoryRouter></ApolloProvider>);
}

test('balance reloads after browser back to the previous wallet', async () => {
  fetchMock.mockResolvedValueOnce(balance(addressA, '100'))
    .mockResolvedValueOnce(balance(addressB, '200'))
    .mockResolvedValueOnce(balance(addressA, '110'));
  show();
  expect(await screen.findByText('100 ASI')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: /1111Ld3z/ }));
  expect(await screen.findByText('200 ASI')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(await screen.findByText('110 ASI')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('Balance unavailable.')).not.toBeInTheDocument();
});

test('keeps an in-flight balance read alive when leaving the page', async () => {
  let finishB!: (response: ReturnType<typeof balance>) => void;
  fetchMock.mockResolvedValueOnce(balance(addressA, '100'))
    .mockReturnValueOnce(new Promise(resolve => { finishB = resolve; }))
    .mockResolvedValueOnce(balance(addressA, '110'));
  show();
  expect(await screen.findByText('100 ASI')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: /1111Ld3z/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(await screen.findByText('110 ASI')).toBeInTheDocument();

  // Leaving the address page must not cancel the read it started: a canceled
  // stream can leave the next balance read waiting for the same connection.
  const pendingSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;
  expect(pendingSignal.aborted).toBe(false);

  await act(async () => { finishB(balance(addressB, '200')); });
  expect(screen.getByText('110 ASI')).toBeInTheDocument();
  expect(screen.queryByText('Balance unavailable.')).not.toBeInTheDocument();
});

test('refreshes the balance after a back/forward-cache restore', async () => {
  fetchMock.mockResolvedValueOnce(balance(addressA, '100'))
    .mockResolvedValueOnce(balance(addressA, '120'));
  show();
  expect(await screen.findByText('100 ASI')).toBeInTheDocument();

  const restore = new Event('pageshow');
  Object.defineProperty(restore, 'persisted', { value: true });
  fireEvent(window, restore);

  expect(await screen.findByText('120 ASI')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
