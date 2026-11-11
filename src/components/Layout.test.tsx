import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});
jest.mock('./AdvancedSearch', () => () => null);
jest.mock('./ConnectionStatus', () => () => null);

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
