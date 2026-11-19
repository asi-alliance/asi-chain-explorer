import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';
import { usePendingDeploysEnabled } from '../hooks/usePendingDeploysStatus';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});
jest.mock('./AdvancedSearch', () => () => null);
jest.mock('./ConnectionStatus', () => () => null);
jest.mock('../hooks/usePendingDeploysStatus', () => ({ usePendingDeploysEnabled: jest.fn() }));

beforeEach(() => {
  (usePendingDeploysEnabled as jest.Mock).mockReturnValue({ enabled: true, loading: false });
});

function renderAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Layout><div /></Layout></MemoryRouter>);
  return within(screen.getByRole('banner')).getAllByRole('link').filter((link) => link.classList.contains('nav-tab'));
}

test('places the Pending tab immediately to the right of Transactions (issue #70)', () => {
  const tabs = renderAt('/');
  const names = tabs.map((tab) => tab.textContent);
  expect(names.indexOf('Pending')).toBe(names.indexOf('Transactions') + 1);
  expect(tabs[names.indexOf('Pending')]).toHaveAttribute('href', '/pending');
});

test('marks only the Pending tab active on the pending page', () => {
  const tabs = renderAt('/pending');
  expect(tabs.filter((tab) => tab.classList.contains('active')).map((tab) => tab.textContent)).toEqual(['Pending']);
});

test('keeps the Pending tab available while checking indexer support', () => {
  (usePendingDeploysEnabled as jest.Mock).mockReturnValue({ enabled: false, loading: true });
  expect(renderAt('/pending').map(tab => tab.textContent)).toContain('Pending');
});

test('hides the Pending tab when the indexer does not track pending deploys', () => {
  (usePendingDeploysEnabled as jest.Mock).mockReturnValue({ enabled: false, loading: false });
  const names = renderAt('/').map((tab) => tab.textContent);
  expect(names).not.toContain('Pending');
  expect(names).toContain('Transactions');
});
