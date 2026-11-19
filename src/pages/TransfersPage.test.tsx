import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import TransfersPage from './TransfersPage';
import { GET_ALL_TRANSFERS } from '../graphql/queries';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const transfer = (id: number, status: string) => ({
  __typename: 'transfers', id: String(id), deploy_id: `deploy-${id}`, from_address: 'genesis', to_address: `1111to${id}`,
  amount_asi: '1', amount_dust: '1000000000000000000', token_decimals: 18, status, block_number: '0',
  created_at: '2026-11-10T00:00:00', timestamp: String(1762770000000 + id),
  deployment: { deploy_id: `deploy-${id}`, block_number: '0', block_hash: 'aa', timestamp: String(1762770000000 + id), errored: false },
});

test('shows genesis movements as completed and never labels a stored transfer failed (issue #66)', () => {
  (useQuery as jest.Mock).mockImplementation((query) => query === GET_ALL_TRANSFERS
    ? { data: { transfers: [transfer(1, 'success'), transfer(2, 'genesis_mint'), transfer(3, 'genesis_bond'),
        transfer(4, 'unexpected_status')] }, loading: false, error: undefined }
    : { data: { deployments: [] }, loading: false, error: undefined });

  render(<MemoryRouter><TransfersPage /></MemoryRouter>);

  for (const label of ['✓ Success', '✓ Genesis Allocation', '✓ Genesis Bond']) {
    expect(screen.getByText(label)).toHaveClass('text-success');
  }
  expect(screen.getByText('unexpected_status')).toHaveClass('text-muted');
  expect(screen.queryByText(/Failed/)).not.toBeInTheDocument();
});
