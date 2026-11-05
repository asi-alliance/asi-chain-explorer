import type { FieldPolicy, TypePolicies } from '@apollo/client';
import { decimalText, rawInteger } from './amounts';

const rawAmount: FieldPolicy = {
  read(value: unknown) {
    return value == null ? value : rawInteger(value).toString();
  },
};
const decimalAmount: FieldPolicy = {
  read(value: unknown) {
    return value == null ? value : decimalText(value);
  },
};

// Preserve strings at the GraphQL boundary and remove only insignificant zeros
// from PostgreSQL's fixed-scale display values.
export const amountTypePolicies: TypePolicies = {
  transfers: { fields: { amount_dust: rawAmount, amount_asi: decimalAmount } },
  validators: { fields: { total_stake: rawAmount } },
  validator_bonds: { fields: { stake: rawAmount } },
  deployments: { fields: { phlo_cost: rawAmount, phlo_limit: rawAmount, phlo_price: rawAmount } },
  transaction_history_view: { fields: { amount_asi: decimalAmount } },
};
