import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useLazyQuery, useQuery } from '@apollo/client';
import HomePage from './HomePage';

jest.mock('@apollo/client', () => ({
  ...jest.requireActual('@apollo/client'),
  useQuery: jest.fn(),
  useLazyQuery: jest.fn(),
}));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  return jest.requireActual('react-router');
});
jest.mock('../components/RealtimeActivityFeed', () => () => null);
jest.mock('../components/RecentDataExporter', () => () => null);

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

beforeEach(() => {
  (useQuery as jest.Mock).mockImplementation(() => ({ data: { blocks: [], network_stats: [] }, loading: false }));
  (useLazyQuery as jest.Mock).mockReturnValue([jest.fn(), { data: undefined, loading: false }]);
});

test('clears and restores Home filters without a URL loop', async () => {
  render(
    <MemoryRouter initialEntries={['/?q=123']}>
      <HomePage />
      <LocationProbe />
      <BackButton />
    </MemoryRouter>
  );

  const input = screen.getByPlaceholderText('Height or hash');
  expect(input).toHaveValue('123');
  fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  expect(input).toHaveValue('');

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/?q=123'));
  expect(input).toHaveValue('123');
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(screen.getByTestId('location')).toHaveTextContent('/?q=123');
});
