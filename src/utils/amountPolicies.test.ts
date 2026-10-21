import { gql, InMemoryCache } from '@apollo/client';
import { amountTypePolicies } from './amountPolicies';

const query = gql`query Amounts { transfers { amount_asi amount_dust } }`;

test('keeps GraphQL amounts exact and trims storage padding', () => {
  const cache = new InMemoryCache({ typePolicies: amountTypePolicies });
  cache.writeQuery({ query, data: { transfers: [{
    __typename: 'transfers',
    amount_asi: '1.000000000000000001' + '0'.repeat(59),
    amount_dust: '1000000000000000001',
  }] } });
  const result = cache.readQuery<any>({ query });
  expect(result.transfers[0].amount_asi).toBe('1.000000000000000001');
  expect(result.transfers[0].amount_dust).toBe('1000000000000000001');
});

test('rejects a rounded GraphQL raw amount instead of showing it', () => {
  const cache = new InMemoryCache({ typePolicies: amountTypePolicies });
  cache.writeQuery({ query, data: { transfers: [{
    __typename: 'transfers', amount_asi: '1', amount_dust: Number.MAX_SAFE_INTEGER + 1,
  }] } });
  expect(() => cache.readQuery({ query })).toThrow('Unsafe integer');
});
