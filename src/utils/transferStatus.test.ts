import { transferStatusView } from './transferStatus';

test.each([
  ['success', 'Success'],
  ['genesis_mint', 'Genesis Allocation'],
  ['genesis_bond', 'Genesis Bond'],
])('treats indexer movement status %s as completed (issue #66)', (status, label) => {
  expect(transferStatusView(status)).toEqual({ label, completed: true });
});

test.each([
  ['unexpected_status', 'unexpected_status'],
  ['', 'Unknown'],
  [null, 'Unknown'],
  [undefined, 'Unknown'],
  ['toString', 'toString'],
])('shows status %p as %s without marking it completed or failed', (status, label) => {
  expect(transferStatusView(status)).toEqual({ label, completed: false });
});
