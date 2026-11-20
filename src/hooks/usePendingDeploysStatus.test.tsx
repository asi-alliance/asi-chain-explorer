import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import PendingDeploysPanel from '../components/PendingDeploysPanel';
import { pendingStatusRows } from '../testing/apolloOperations';
import { PendingDeploysStatusProvider } from './usePendingDeploysStatus';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});
jest.mock('../components/AdvancedSearch', () => () => null);
jest.mock('../components/ConnectionStatus', () => () => null);

test('one status subscription enables and disables the Pending tab and panel together', async () => {
  const operations: string[] = [];
  let publishStatus: (rows: ReturnType<typeof pendingStatusRows>) => void;
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    queryDeduplication: false,
    link: new ApolloLink(operation => new Observable(observer => {
      operations.push(operation.operationName);
      if (operation.operationName === 'WatchPendingDeploysStatus') {
        publishStatus = rows => observer.next({ data: { indexer_state: rows } });
        publishStatus([]);
      } else if (operation.operationName === 'WatchPendingDeploys') {
        observer.next({ data: { pending_deploys: [] } });
      }
    })),
  });
  render(
    <ApolloProvider client={client}>
      <MemoryRouter>
        <PendingDeploysStatusProvider>
          <Layout><PendingDeploysPanel /></Layout>
        </PendingDeploysStatusProvider>
      </MemoryRouter>
    </ApolloProvider>,
  );
  await screen.findByText(/does not track pending deploys/);
  expect(screen.queryByRole('link', { name: 'Pending' })).toBeNull();
  await act(async () => publishStatus(pendingStatusRows()));
  expect(await screen.findByText(/Updates live/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Pending' })).toBeInTheDocument();
  await act(async () => publishStatus([]));
  expect(await screen.findByText(/does not track pending deploys/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Pending' })).toBeNull();
  expect(operations).toEqual(['WatchPendingDeploysStatus', 'WatchPendingDeploys']);
});
