import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import ValidatorHistoryPage from './ValidatorHistoryPage';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));
jest.mock('react-router-dom', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
  // CRA's Jest resolver predates react-router-dom's react-router/dom export.
  return jest.requireActual('react-router');
});

const renderPage = () => render(
  <MemoryRouter>
    <ValidatorHistoryPage />
  </MemoryRouter>
);

test('selects one complete sibling snapshot and permits genesis height zero', () => {
  const query = useQuery as jest.Mock;
  query.mockImplementation((document, options) => {
    if (!options) return { data: { blocks: [{ block_number: 1088, block_hash: 'latest' }] } };
    return { data: { blocks: ['a', 'b', 'c'].map((hash, i) => ({
      block_number: options.variables.blockNumber, block_hash: hash, timestamp: Date.now(), proposer: 'validator-1',
      validator_bonds: ['validator-1', 'validator-2', 'validator-3'].map(validator_public_key => ({
        validator_public_key, stake: String((i+1)*10000000000000), token_decimals: 18
      }))
    })) } };
  });
  renderPage();
  expect(screen.getAllByRole('row')).toHaveLength(4);
  expect(screen.getAllByRole('cell', {name: '0.00001 ASI'})).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Validator history block hash'), {target: {value: 'b'}});
  expect(screen.getAllByRole('row')).toHaveLength(4);
  expect(screen.getAllByRole('cell', {name: '0.00002 ASI'})).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Block:'), {target: {value: '0'}});
  expect(query.mock.calls.at(-1)?.[1].variables.blockNumber).toBe('0');
});

test('links the height and proposer, and keeps an absolute time tooltip', () => {
  const query = useQuery as jest.Mock;
  query.mockImplementation((document, options) => {
    if (!options) return { data: { blocks: [{ block_number: '1088', block_hash: 'latest' }] } };
    return { data: { blocks: [{
      block_number: '1088', block_hash: 'latest', timestamp: Date.now(), proposer: 'validator-1',
      validator_bonds: [{ validator_public_key: 'validator-1', stake: '1000000000000000000', token_decimals: 18 }],
    }] } };
  });
  renderPage();

  expect(screen.getByRole('link', { name: '#1,088' })).toHaveAttribute('href', '/height/1088');
  expect(screen.getByRole('link', { name: 'validator-1' })).toHaveAttribute('href', '/validators');
  const time = screen.getByText('just now');
  expect(time.getAttribute('title')).toMatch(/\d{4}/);
});
