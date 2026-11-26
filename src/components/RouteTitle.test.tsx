import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteTitle, { routeTitle } from './RouteTitle';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const ID = '3045022100a8ed15d9b4d0105c53805f32ef7ea99fb6f1433d92b0c84bb5b4ea3fa9f7af9f02204bfd0c0726be5137ada40773a559d9949e9a50f5ee45938f1f7da3715f6fc343';
const HASH = '52d15d231af73166b8606432f755db4a836c1f0120280ac73ed702b5a6bcf621';

afterEach(() => {
  document.title = 'ASI Chain Explorer';
});

test('builds route-specific titles', () => {
  expect(routeTitle('/')).toBe('Latest blocks');
  expect(routeTitle('/', '?q=2045')).toBe('Search: 2045');
  expect(routeTitle('/', '?finalized=1')).toBe('Finalized blocks');
  expect(routeTitle('/transactions', '?tab=transfers')).toBe('Transfers');
  expect(routeTitle('/transactions')).toBe('Deployments');
  expect(routeTitle('/block/2045')).toBe('Height #2045');
  expect(routeTitle(`/block/hash/${HASH}`)).toBe(`Block ${HASH.slice(0, 8)}…${HASH.slice(-6)}`);
  expect(routeTitle(`/transaction/${ID}`)).toBe(`Transaction ${ID.slice(0, 8)}…${ID.slice(-6)}`);
  expect(routeTitle('/search', '?q=deploy')).toBe('Search: deploy');
  expect(routeTitle('/address/1111abcdefghijklmnop')).toContain('Address 1111abcd…');
  expect(routeTitle('/unknown')).toBe('Page not found');
});

test('sets document.title from the current location', () => {
  render(
    <MemoryRouter initialEntries={['/block/2045']}>
      <RouteTitle />
    </MemoryRouter>
  );

  expect(document.title).toBe('Height #2045 · ASI Chain Explorer');
});
