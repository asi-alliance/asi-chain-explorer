import { gql } from '@apollo/client';

const NATIVE_TRANSFER_OUTCOME_FIELDS = gql`
  fragment NativeTransferOutcomeFields on native_transfer_lifecycle {
    call_id
    call_index
    initiation_block_hash
    initiation_block_number
    initiation_deploy_id
    from_address
    to_address
    requested_amount
    token_decimals
    status
    result_id
    completion_block_hash
    completion_block_number
    completion_deploy_id
    transfer_id
  }
`;

// Read-only indexer view (migration 003): one row per observed native transfer
// call outcome. Count movements from the transfers ledger, not from these rows.
// Each field filters by one deploy column, so the indexer can use its indexes
// (migration 006). An _or over both columns reads the whole view.
export const GET_NATIVE_TRANSFER_LIFECYCLE = gql`
  ${NATIVE_TRANSFER_OUTCOME_FIELDS}
  query GetNativeTransferLifecycle($deployId: String!, $limit: Int!) {
    initiated: native_transfer_lifecycle(
      where: { initiation_deploy_id: { _eq: $deployId } }
      order_by: [
        { initiation_block_number: asc }
        { call_index: asc }
        { completion_block_number: asc_nulls_last }
      ]
      limit: $limit
    ) {
      ...NativeTransferOutcomeFields
    }
    completedHere: native_transfer_lifecycle(
      where: {
        completion_deploy_id: { _eq: $deployId }
        initiation_deploy_id: { _neq: $deployId }
      }
      order_by: [
        { initiation_block_number: asc }
        { call_index: asc }
        { completion_block_number: asc_nulls_last }
      ]
      limit: $limit
    ) {
      ...NativeTransferOutcomeFields
    }
  }
`;
