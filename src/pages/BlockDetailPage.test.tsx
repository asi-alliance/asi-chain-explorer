import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'react-toastify';
import BlockDetailPage from './BlockDetailPage';
import { Deployment } from '../types';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn() } }));
const mockToastSuccess = toast.success as jest.Mock;

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
  block_size: 2048,
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

function renderHeightWith(link: ApolloLink, path = '/height/72418') {
  const client = new ApolloClient({ cache: new InMemoryCache(), link });
  return render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
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
    if (operation.operationName === 'GetBlockSize') {
      return Observable.of({ data: { blocks: [{ block_hash: hashes[0], block_size: '2048' }] } });
    }
    if (operation.operationName === 'GetHeightCounts') {
      return Observable.of({
        data: {
          height_total: { aggregate: { count: 2 } },
          height_finalized: { aggregate: { count: 2 } },
        },
      });
    }
    expect(operation.operationName).toBe('GetBlocksAtHeight');
    return Observable.of({ data: { blocks } });
  }));
}

type DeploymentFixture = Deployment & {
  __typename: 'deployments';
  seq_num?: number | null;
  shard_id?: string | null;
};

function deployment(overrides: Partial<DeploymentFixture> = {}): DeploymentFixture {
  return {
    __typename: 'deployments',
    deploy_id: 'a'.repeat(130),
    deployer: `04${'1'.repeat(128)}`,
    term: 'Nil',
    timestamp: Date.now() - 30_000,
    deployment_type: 'Contract Deployment',
    phlo_cost: '1',
    phlo_price: '1',
    phlo_limit: '1000000',
    valid_after_block_number: 0,
    status: 'included',
    block_number: 72418,
    block_hash: hashes[0],
    seq_num: 1,
    shard_id: 'root',
    sig: 'sig',
    sig_algorithm: 'secp256k1',
    errored: false,
    error_message: '',
    created_at: new Date().toISOString(),
    transfers: [],
    ...overrides,
  };
}

function renderBlockWithDeployments(deployments: DeploymentFixture[]) {
  const block = { ...blocks[0], deployments };
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(operation => {
      if (operation.operationName === 'GetLatestHeight') {
        return Observable.of({ data: { blocks: [{ block_number: '72420', block_hash: 'c'.repeat(64) }] } });
      }
      if (operation.operationName === 'GetBlockSize') {
        return Observable.of({ data: { blocks: [{ block_hash: block.block_hash, block_size: block.block_size }] } });
      }
      expect(operation.operationName).toBe('GetBlockDetails');
      return Observable.of({ data: { blocks: [block] } });
    }),
  });
  return render(
    <ApolloProvider client={client}>
      <MemoryRouter initialEntries={[`/block/hash/${hashes[0]}`]}>
        <Routes>
          <Route path="/block/hash/:blockHash" element={<BlockDetailPage />} />
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
  expect(await screen.findByRole('link', { name: /Height #72417/ })).toHaveAttribute('href', '/height/72417');
  expect(await screen.findByRole('link', { name: /Height #72419/ })).toHaveAttribute('href', '/height/72419');
  expect(screen.queryByText('Block Details')).not.toBeInTheDocument();

  const siblingLinks = screen.getAllByRole('link', { name: /Open block/ });
  expect(siblingLinks.map((link) => link.getAttribute('href'))).toEqual(
    hashes.map((hash) => `/block/hash/${hash}`)
  );
});

test('copies the height and each sibling hash with feedback', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  mockToastSuccess.mockClear();
  renderHeight();

  await screen.findByRole('heading', { name: '#72418' });
  expect(screen.getByText('2 sibling blocks')).toHaveAttribute(
    'title',
    'A DAG height can contain multiple sibling blocks'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Copy height 72418' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('72418'));
  expect(mockToastSuccess).toHaveBeenCalledWith('Copied height 72418');

  const siblingCopies = screen.getAllByRole('button', { name: /Copy block hash/ });
  expect(siblingCopies).toHaveLength(2);
  fireEvent.click(siblingCopies[0]);
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(hashes[0]));
  expect(mockToastSuccess).toHaveBeenCalledWith('Block hash copied');
  expect(screen.getAllByRole('link', { name: /Open block/ })).toHaveLength(2);
});

test('shows the height overview when the height has a single sibling', async () => {
  renderHeightWith(new ApolloLink(operation => {
    if (operation.operationName === 'GetLatestHeight') {
      return Observable.of({ data: { blocks: [{ block_number: '72420', block_hash: 'c'.repeat(64) }] } });
    }
    if (operation.operationName === 'GetHeightCounts') {
      return Observable.of({
        data: {
          height_total: { aggregate: { count: 1 } },
          height_finalized: { aggregate: { count: 1 } },
        },
      });
    }
    return Observable.of({ data: { blocks: [blocks[0]] } });
  }));

  expect(await screen.findByRole('heading', { name: '#72418' })).toBeInTheDocument();
  expect(screen.getByText('1 sibling block')).toBeInTheDocument();
  expect(screen.queryByText('Block Details')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open block/ }))
    .toHaveAttribute('href', `/block/hash/${hashes[0]}`);
});

test('applies the finalization filter before the sibling limit and uses aggregate totals', async () => {
  const finalized = {
    ...blocks[0],
    block_hash: 'finalized-block',
    finalization_status: 'finalized',
    deployments: [],
  };
  let seenFilter: any;
  renderHeightWith(
    new ApolloLink(operation => {
      if (operation.operationName === 'GetLatestHeight') {
        return Observable.of({ data: { blocks: [{ block_number: '72420', block_hash: 'c'.repeat(64) }] } });
      }
      if (operation.operationName === 'GetBlockSize') {
        return Observable.of({ data: { blocks: [{ block_hash: 'finalized-block', block_size: '2048' }] } });
      }
      if (operation.operationName === 'GetHeightCounts') {
        return Observable.of({
          data: {
            height_total: { aggregate: { count: 101 } },
            height_finalized: { aggregate: { count: 1 } },
          },
        });
      }
      seenFilter = operation.variables.filter;
      return Observable.of({
        data: {
          blocks: [finalized],
        },
      });
    }),
    '/height/72418?status=finalized'
  );

  expect(await screen.findByRole('heading', { name: '#72418' })).toBeInTheDocument();
  expect(seenFilter).toEqual({
    block_number: { _eq: '72418' },
    finalization_status: { _eq: 'finalized' },
  });
  expect(screen.getByText('101 sibling blocks')).toBeInTheDocument();
  expect(screen.getByText('1 of 101')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open block/ })).toHaveAttribute(
    'href',
    '/block/hash/finalized-block'
  );
});


test('falls back to the loaded siblings when height aggregates are unavailable', async () => {
  renderHeightWith(new ApolloLink(operation => {
    if (operation.operationName === 'GetLatestHeight') {
      return Observable.of({ data: { blocks: [{ block_number: '72420', block_hash: 'c'.repeat(64) }] } });
    }
    if (operation.operationName === 'GetBlockSize') {
      return Observable.of({ data: { blocks: [] } });
    }
    if (operation.operationName === 'GetHeightCounts') {
      return Observable.of({ errors: [{ message: 'blocks_aggregate is not available' }] });
    }
    return Observable.of({ data: { blocks } });
  }));

  expect(await screen.findByRole('heading', { name: '#72418' })).toBeInTheDocument();
  expect(screen.getByText('2 sibling blocks')).toBeInTheDocument();
  expect(screen.getByText('2 of 2')).toBeInTheDocument();
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

test('keeps block metadata off deployment cards and renders block sequence zero', async () => {
  renderBlockWithDeployments([
    deployment({ deploy_id: 'a'.repeat(130), deployment_type: 'Indexed deployment', seq_num: 7, shard_id: 'root' }),
  ]);

  expect(await screen.findByRole('heading', { name: 'Block Details' })).toBeInTheDocument();
  expect(screen.getByText('Sequence Number').nextElementSibling).toHaveTextContent('0');
  expect(screen.getByText('Shard ID').nextElementSibling).toHaveTextContent('root');
  expect(screen.getByText('Block Size').nextElementSibling).toHaveTextContent('2.05 KB');

  const card = screen
    .getByRole('heading', { name: 'Indexed deployment', level: 4 })
    .closest('.deployment-item') as HTMLElement;
  expect(within(card).queryByText('Sequence')).not.toBeInTheDocument();
  expect(within(card).queryByText('Shard ID')).not.toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'a'.repeat(130) })).toHaveAttribute(
    'href',
    `/transaction/${'a'.repeat(130)}`
  );
});

test('renders Valid After Block only when the indexer has a value, including zero', async () => {
  renderBlockWithDeployments([
    deployment({ deploy_id: 'a'.repeat(130), valid_after_block_number: null }),
    deployment({ deploy_id: 'b'.repeat(130), valid_after_block_number: 0 }),
  ]);

  expect(await screen.findByRole('heading', { name: 'Block Details' })).toBeInTheDocument();
  const cards = screen
    .getAllByRole('heading', { name: 'Contract Deployment', level: 4 })
    .map(heading => heading.closest('.deployment-item') as HTMLElement);

  expect(within(cards[0]).queryByText('Valid After Block')).not.toBeInTheDocument();
  expect(within(cards[1]).getByText('Valid After Block').nextElementSibling).toHaveTextContent('0');
});
