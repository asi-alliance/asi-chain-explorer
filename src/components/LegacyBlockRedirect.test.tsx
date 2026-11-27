import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LegacyBlockRedirect from './LegacyBlockRedirect';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/block/:blockNumber" element={<LegacyBlockRedirect />} />
        <Route path="/block/hash/:blockHash" element={<LocationProbe />} />
        <Route path="/height/:height" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

test('redirects a legacy numeric block path to the height overview', () => {
  renderAt('/block/7373?status=finalized');
  expect(screen.getByTestId('location')).toHaveTextContent('/height/7373?status=finalized');
});

test('treats a non-numeric legacy path as a block hash', () => {
  renderAt('/block/deadbeef');
  expect(screen.getByTestId('location')).toHaveTextContent('/block/hash/deadbeef');
});
