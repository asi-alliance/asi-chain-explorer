import { gql } from '@apollo/client';

// Read-only indexer view (migration 003): one row per observed native transfer
// call outcome. Count movements from the transfers ledger, not from these rows.
export const GET_NATIVE_TRANSFER_LIFECYCLE = gql`
  query GetNativeTransferLifecycle($deployId: String!) {
    native_transfer_lifecycle(
      where: {
        _or: [
          { initiation_deploy_id: { _eq: $deployId } }
          { completion_deploy_id: { _eq: $deployId } }
        ]
      }
      order_by: [
        { initiation_block_number: asc }
        { call_index: asc }
        { completion_block_number: asc_nulls_last }
      ]
      limit: 200
    ) {
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
  }
`;
