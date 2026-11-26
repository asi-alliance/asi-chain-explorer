import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BlockDetailPage from './BlockDetailPage';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const hashes = ['a'.repeat(64), 'b'.repeat(64)];
const blocks = hashes.map((block_hash, index) => ({
  __typename: 'blocks',
  block_number: '72418',
  block_hash,
  proposer: `04${String(index).repeat(64)}`,
  timestamp: String(Date.now() - 60_000 - index * 1_000),
  deployment_count: 2,
  finalization_status: 'finalized',
  parent_links: [],
  child_links: [],
  state_hash: null,
  pre_state_hash: null,
  state_root_hash: null,
  bonds_map: null,
  token_decimals: 8,
  fault_tolerance: 0.33,
  justifications: [],
  seq_num: 0,
  shard_id: 'root',
  sig: null,
  sig_algorithm: 'secp256k1',
  version: 1,
  extra_bytes: '',
  created_at: new Date().toISOString(),
  deployments: [],
}));

function renderHeightWith(link: ApolloLink) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link });
  return render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/height/72418']}>
        <Routes>
          <Route path="/height/:height" element={<BlockDetailPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>
  );
}

function renderHeight() {
  return renderHeightWith(new ApolloLink(operation => {
    if (operation.operationName === 'GetLatestHeight') {
      return Observable.of({ data: { blocks: [{ block_number: '72420', block_hash: 'c'.repeat(64) }] } });
    }
    expect(operation.operationName).toBe('GetBlocksAtHeight');
    return Observable.of({ data: { blocks } });
  }));
}

test('shows one height overview with all siblings instead of an arbitrary first block', async () => {
  renderHeight();

  expect(await screen.findByRole('heading', { name: '#72418' })).toBeInTheDocument();
  expect(screen.getByText('2 sibling blocks')).toBeInTheDocument();
  expect(screen.getByText('2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/');
  expect(await screen.findByRole('link', { name: /Height #72417/ })).toHaveAttribute('href', '/height/72417');
  expect(await screen.findByRole('link', { name: /Height #72419/ })).toHaveAttribute('href', '/height/72419');
  expect(screen.queryByText('Block Details')).not.toBeInTheDocument();

  const siblingLinks = screen.getAllByRole('link', { name: /Open block/ });
  expect(siblingLinks.map((link) => link.getAttribute('href'))).toEqual(
    hashes.map((hash) => `/block/hash/${hash}`)
  );
});

test('shows a loading skeleton for a height or block', () => {
  renderHeightWith(new ApolloLink(operation => {
    if (operation.operationName === 'GetLatestHeight') return Observable.of({ data: { blocks: [] } });
    return new Observable(() => {});
  }));

  expect(screen.getByRole('status', { name: 'Loading block details' })).toBeInTheDocument();
});

test('shows a retryable error when block details fail to load', async () => {
  renderHeightWith(new ApolloLink(operation => {
    if (operation.operationName === 'GetLatestHeight') return Observable.of({ data: { blocks: [] } });
    return Observable.of({ errors: [{ message: 'height failed' }] });
  }));

  expect(await screen.findByRole('heading', { name: 'Block details unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/');
});
