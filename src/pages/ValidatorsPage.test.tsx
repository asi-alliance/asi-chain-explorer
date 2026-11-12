import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { useQuery } from '@apollo/client';
import ValidatorsPage from './ValidatorsPage';

jest.mock('@apollo/client', () => ({ ...jest.requireActual('@apollo/client'), useQuery: jest.fn() }));

const KEY = '04' + 'ab'.repeat(40);

function renderValidators(data: any) {
  cleanup();
  (useQuery as jest.Mock).mockReturnValue({ data, loading: false, error: undefined });
  render(<ValidatorsPage />);
  const rows = screen.getAllByRole('row').slice(1);
  return rows.map(row => within(row).getAllByRole('cell').map(cell => cell.textContent));
}

const validator = (overrides: object = {}) => ({
  public_key: KEY, status: 'active', total_stake: '0', token_decimals: 18,
  first_seen_block: '0', last_seen_block: '100', created_at: '', ...overrides,
});
const bond = (block_number: unknown, stake: string, token_decimals = 18) =>
  ({ validator_public_key: KEY, block_number, stake, token_decimals });

test.each([
  ['100', '99'],
  ['10', '9'],
])('selects the bond at string height %s over %s (issue #61)', (newer, older) => {
  // Hasura already returns bonds in block_number desc order.
  const [row] = renderValidators({
    validators: [validator()],
    validator_bonds: [bond(newer, '1000000000000000000'), bond(older, '2000000000000000000')],
    blocks: [],
  });
  expect(row[1]).toBe('1');
  expect(row[6]).toBe(`#${newer}`);
});

test('selects the numerically newest bond regardless of response order and legacy number heights', () => {
  const [row] = renderValidators({
    validators: [validator()],
    validator_bonds: [bond('99', '2'), bond(100, '1'), bond('9', '3')],
    blocks: [],
  });
  expect(row[6]).toBe('#100');
  expect(row[1]).toBe('0.000000000000000001');
});

test('keeps exact heights beyond 2^53 and valid genesis height zero', () => {
  const [row] = renderValidators({
    validators: [validator()],
    validator_bonds: [bond('9007199254740992', '6'), bond('9007199254740993', '5'), bond('0', '7')],
    blocks: [],
  });
  expect(row[6]).toBe('#9007199254740993');
  expect(row[1]).toBe('0.000000000000000005');

  const [genesis] = renderValidators({
    validators: [validator()],
    validator_bonds: [bond('0', '100000000', 8)],
    blocks: [],
  });
  expect(genesis[6]).toBe('#0');
  expect(genesis[1]).toBe('1');
});

test('does not let malformed or unsafe heights replace a valid bond', () => {
  const [row] = renderValidators({
    validators: [validator()],
    validator_bonds: [bond('1e9', '9'), bond(Number.MAX_SAFE_INTEGER + 2, '9'), bond('100', '1000000000000000000'),
      bond(' 200', '9'), bond('-1', '9')],
    blocks: [],
  });
  expect(row[6]).toBe('#100');
  expect(row[1]).toBe('1');
});

test("keeps each bond's recorded 8/18 decimals in stake, total and percentages", () => {
  const other = '04' + 'cd'.repeat(40);
  const rows = renderValidators({
    validators: [validator(), validator({ public_key: other })],
    validator_bonds: [
      bond('100', '1000000000000000001'),
      { validator_public_key: other, block_number: '50', stake: '100000000', token_decimals: 8 },
    ],
    blocks: [],
  });
  expect(rows.map(row => row[1])).toEqual(['1.000000000000000001', '1']);
  expect(screen.getByText(/^2\.000000000000000001 ASI$/)).toBeInTheDocument();
  expect(rows.map(row => row[2])).toEqual(['50%', '49.99%']);
});

test('prefers the duplicate validator record with the numerically newer last_seen_block', () => {
  const abbreviated = `${KEY.slice(0, 8)}...${KEY.slice(-8)}`;
  const [row] = renderValidators({
    validators: [
      validator({ public_key: abbreviated, last_seen_block: '100' }),
      validator({ public_key: abbreviated, last_seen_block: '99' }),
      validator({ public_key: abbreviated, last_seen_block: '9' }),
    ],
    validator_bonds: [],
    blocks: [],
  });
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(row[5]).toBe('#100');
});

test('keeps inactive validators out of the count, total, average and percentages (issue #66)', () => {
  const bonded = '04' + 'cd'.repeat(40);
  const inactive = '04' + 'ef'.repeat(40);
  cleanup();
  (useQuery as jest.Mock).mockReturnValue({
    data: {
      validators: [
        validator({ total_stake: '1000000000000000000' }),
        validator({ public_key: bonded, status: 'bonded', total_stake: '3000000000000000000' }),
        validator({ public_key: inactive, status: 'inactive', total_stake: '50000000000000000000' }),
      ],
      validator_bonds: [],
      blocks: [],
    },
    loading: false,
    error: undefined,
  });
  render(<ValidatorsPage />);

  const cells = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)
    .map(row => within(row).getAllByRole('cell').map(cell => cell.textContent));

  const current = cells(screen.getByRole('table', { name: 'Current validators' }));
  expect(current.map(row => row[1])).toEqual(['3', '1']);
  expect(current.map(row => row[2])).toEqual(['75%', '25%']);
  expect(screen.getByRole('heading', { level: 1, name: '2' })).toBeInTheDocument();
  expect(screen.getByText(/^4 ASI$/)).toBeInTheDocument();
  expect(screen.getByText(/^2 ASI$/)).toBeInTheDocument();

  const inactiveRows = cells(screen.getByRole('table', { name: 'Inactive Validators' }));
  expect(inactiveRows).toHaveLength(1);
  expect(inactiveRows[0][1]).toBe('50');
  expect(inactiveRows[0][5]).toBe('inactive');
});

test('shows no current validators when every validator is inactive', () => {
  cleanup();
  (useQuery as jest.Mock).mockReturnValue({
    data: { validators: [validator({ status: 'inactive', total_stake: '1000000000000000000' })], validator_bonds: [], blocks: [] },
    loading: false,
    error: undefined,
  });
  render(<ValidatorsPage />);

  expect(screen.queryByRole('table', { name: 'Current validators' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: '0' })).toBeInTheDocument();
  expect(screen.getByText(/^0 ASI$/)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Inactive Validators' })).toBeInTheDocument();
});

test('reports a failed validator query instead of zero stake', () => {
  cleanup();
  (useQuery as jest.Mock).mockReturnValue({ data: undefined, loading: false, error: new Error('database timeout') });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<ValidatorsPage />);
  expect(screen.getByText('database timeout')).toBeInTheDocument();
  expect(screen.queryByText(/ASI Staked/)).not.toBeInTheDocument();
});
