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

function renderHeight() {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(operation => {
      expect(operation.operationName).toBe('GetBlocksAtHeight');
      return Observable.of({ data: {
        blocks,
        blocks_aggregate: { aggregate: { count: blocks.length } },
      } });
    }),
  });
  return render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={['/block/72418']}>
        <Routes>
          <Route path="/block/:blockNumber" element={<BlockDetailPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </ApolloProvider>
  );
}

test('shows one height overview with all siblings instead of an arbitrary first block', async () => {
  renderHeight();

  expect(await screen.findByRole('heading', { name: '#72418' })).toBeInTheDocument();
  expect(screen.getByText('2 sibling blocks')).toBeInTheDocument();
  expect(screen.getByText('2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/');
  expect(screen.queryByText('Block Details')).not.toBeInTheDocument();

  const siblingLinks = screen.getAllByRole('link', { name: /Open block/ });
  expect(siblingLinks.map((link) => link.getAttribute('href'))).toEqual(
    hashes.map((hash) => `/block/hash/${hash}`)
  );
});
