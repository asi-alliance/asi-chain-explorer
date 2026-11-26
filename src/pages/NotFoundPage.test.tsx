import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';

jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});
jest.mock('../components/AdvancedSearch', () => () => <div data-testid="chain-search" />);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>
  );

test('explains the missing page and echoes the attempted path', () => {
  renderAt('/does/not/exist');
  expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
  expect(screen.getByText('/does/not/exist')).toBeInTheDocument();
});

test('offers the chain search and recovery links', () => {
  renderAt('/nope');
  expect(screen.getByTestId('chain-search')).toBeInTheDocument();
  const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
  expect(links).toEqual(expect.arrayContaining(['/', '/transactions', '/validators']));
});

test('keeps the path escaped as text', () => {
  renderAt('/<img src=x onerror=alert(1)>');
  expect(screen.getByText('/<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('img')).not.toBeInTheDocument();
});
