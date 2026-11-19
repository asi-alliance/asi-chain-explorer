import React from 'react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable } from '@apollo/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecentDataExporter, { ExportEntities } from './RecentDataExporter';
import { amountTypePolicies } from '../utils/amountPolicies';

const blobText = (blob: Blob) => new Promise<string>(resolve => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

let exported: Blob[];
beforeEach(() => {
  exported = [];
  Object.assign(URL, { createObjectURL: jest.fn((blob: Blob) => { exported.push(blob); return 'blob:csv'; }) });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function renderExporter(result: object) {
  const client = new ApolloClient({
    cache: new InMemoryCache({ typePolicies: amountTypePolicies }),
    link: new ApolloLink(() => Observable.of(result)),
  });
  render(<ApolloProvider client={client}><RecentDataExporter entityToExport={ExportEntities.TRANSFERS} /></ApolloProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Export recent transactions' }));
}

test('exports exact raw amounts with their recorded 8/18 decimals', async () => {
  const transfer = { __typename: 'transfers', deploy_id: 'd', block_number: '9007199254740993', timestamp: '1',
    created_at: '', status: 'success', from_address: 'a', from_public_key: 'k', to_address: 'b' };
  renderExporter({ data: { transfers: [
    { ...transfer, id: '1', amount_asi: '1.000000000000000001', amount_dust: '1000000000000000001', token_decimals: 18 },
    { ...transfer, id: '2', amount_asi: '1.00000000', amount_dust: '100000000', token_decimals: 8 },
    { ...transfer, id: '3', amount_asi: '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
      amount_dust: (2n ** 256n - 1n).toString(), token_decimals: 18 },
  ] } });
  await waitFor(() => expect(exported).toHaveLength(1));
  const [header, ...rows] = (await blobText(exported[0])).replace(/^﻿/, '').trim().split(/\r?\n/)
    .map(line => line.split(','));
  const column = (name: string) => rows.map(row => row[header.indexOf(name)]);
  expect(column('amount_dust')).toEqual(['1000000000000000001', '100000000', (2n ** 256n - 1n).toString()]);
  expect(column('amount_asi')).toEqual(['1.000000000000000001', '1',
    '115792089237316195423570985008687907853269984665640564039457.584007913129639935']);
  expect(column('token_decimals')).toEqual(['18', '8', '18']);
  expect(column('block_number')).toEqual(['9007199254740993', '9007199254740993', '9007199254740993']);
});

test('reports a GraphQL error envelope and produces no file', async () => {
  renderExporter({ errors: [{ message: 'statement timeout' }] });
  expect(await screen.findByRole('button', { name: 'Export failed: statement timeout' })).toBeInTheDocument();
  expect(exported).toHaveLength(0);
});
