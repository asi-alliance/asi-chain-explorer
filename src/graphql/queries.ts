import { gql } from '@apollo/client';

// Fragments
export const BLOCK_FRAGMENT = gql`
  fragment BlockFragment on blocks {
    block_number
    block_hash
    parent_links {
      parent_hash
      parent_index
    }
    timestamp
    proposer
    deployment_count
    state_hash
    pre_state_hash
    state_root_hash
    bonds_map
    token_decimals
    fault_tolerance
    finalization_status
    justifications
    seq_num
    shard_id
    sig
    sig_algorithm
    version
    extra_bytes
    created_at
  }
`;

export const DEPLOYMENT_FRAGMENT = gql`
  fragment DeploymentFragment on deployments {
    deploy_id
    deployer
    term
    timestamp
    deployment_type
    phlo_cost
    phlo_price
    phlo_limit
    valid_after_block_number
    status
    block_number
    block_hash
    seq_num
    shard_id
    sig
    sig_algorithm
    errored
    error_message
    created_at
  }
`;

export const TRANSFER_FRAGMENT = gql`
  fragment TransferFragment on transfers {
    id
    deploy_id
    from_address
    to_address
    amount_asi
    amount_dust
    token_decimals
    status
    block_number
    created_at
    timestamp
  }
`;

export const VALIDATOR_FRAGMENT = gql`
  fragment ValidatorFragment on validators {
    public_key
    name
    status
    total_stake
    token_decimals
    first_seen_block
    last_seen_block
    created_at
    updated_at
  }
`;

// Queries
export const GET_LATEST_BLOCKS = gql`
  ${BLOCK_FRAGMENT}
  ${DEPLOYMENT_FRAGMENT}
  query GetLatestBlocks($limit: Int = 10, $offset: Int = 0, $where: blocks_bool_exp = {}) {
    blocks(
      limit: $limit
      offset: $offset
      order_by: { block_number: desc }
      where: $where
    ) {
      ...BlockFragment
      deployments {
        ...DeploymentFragment
      }
    }
  }
`;

export const SEARCH_BLOCKS_BY_HASH = gql`
  ${BLOCK_FRAGMENT}
  query SearchBlocksByHash($search: String!, $limit: Int = 10, $offset: Int = 0, $where: blocks_bool_exp = {}) {
    blocks(
      limit: $limit
      offset: $offset
      order_by: { block_number: desc }
      where: {
        _and: [
          { block_hash: { _ilike: $search } }
          $where
        ]
      }
    ) {
      ...BlockFragment
    }
  }
`;

export const SEARCH_BLOCKS_BY_NUMBER = gql`
  ${BLOCK_FRAGMENT}
  query SearchBlocksByNumber($blockNumber: bigint!, $limit: Int = 10, $offset: Int = 0, $where: blocks_bool_exp = {}) {
    blocks(
      limit: $limit
      offset: $offset
      order_by: { block_number: desc }
      where: {
        _and: [
          { block_number: { _eq: $blockNumber } }
          $where
        ]
      }
    ) {
      ...BlockFragment
    }
  }
`;

export const GET_LATEST_HEIGHT = gql`
  query GetLatestHeight {
    blocks(limit: 1, order_by: { block_number: desc }) {
      block_number
      block_hash
    }
  }
`;

export const GET_BLOCK_DETAILS = gql`
  ${BLOCK_FRAGMENT}
  ${DEPLOYMENT_FRAGMENT}
  ${TRANSFER_FRAGMENT}
  query GetBlockDetails($blockHash: String!) {
    blocks(where: { block_hash: { _eq: $blockHash } }) {
      ...BlockFragment
      child_links {
        block_hash
        parent_index
      }
      deployments {
        ...DeploymentFragment
        transfers {
          ...TransferFragment
        }
      }
    }
  }
`;

export const GET_BLOCKS_AT_HEIGHT = gql`
  ${BLOCK_FRAGMENT}
  ${DEPLOYMENT_FRAGMENT}
  ${TRANSFER_FRAGMENT}
  query GetBlocksAtHeight($blockNumber: bigint!) {
    blocks(
      where: { block_number: { _eq: $blockNumber } }
      order_by: { block_hash: asc }
      limit: 100
    ) {
      ...BlockFragment
      child_links {
        block_hash
        parent_index
      }
      deployments {
        ...DeploymentFragment
        transfers {
          ...TransferFragment
        }
      }
    }
  }
`;

export const SEARCH_BLOCKS = gql`
  ${BLOCK_FRAGMENT}
  query SearchBlocks($hashPrefix: String!) {
    blocks(
      where: { block_hash: { _like: $hashPrefix } }
      limit: 10
      order_by: { block_number: desc }
    ) {
      ...BlockFragment
    }
  }
`;

export const GET_ALL_TRANSFERS = gql`
  ${TRANSFER_FRAGMENT}
  query GetAllTransfers($limit: Int = 50, $offset: Int = 0) {
    transfers(
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      ...TransferFragment
      deployment {
        deploy_id
        block_number
        block_hash
        timestamp
        errored
      }
    }
  }
`;

export const GET_LATEST_TRANSFERS = gql`
  ${TRANSFER_FRAGMENT}
  query GetLatestTransfers($limit: Int = 5) {
    transfers(
      limit: $limit
      order_by: { created_at: desc }
    ) {
      ...TransferFragment
    }
  }
`;

export const GET_LATEST_DEPLOYMENTS = gql`
  ${DEPLOYMENT_FRAGMENT}
  query GetLatestDeployments($limit: Int = 5) {
    deployments(
      limit: $limit
      order_by: { timestamp: desc }
    ) {
      ...DeploymentFragment
    }
  }
`;

export const GET_ADDRESS_TRANSFERS = gql`
  ${TRANSFER_FRAGMENT}
  query GetAddressTransfers($address: String!, $limit: Int = 20) {
    transfers(
      where: {
        _or: [
          { from_address: { _eq: $address } }
          { to_address: { _eq: $address } }
        ]
      }
      limit: $limit
      order_by: { created_at: desc }
    ) {
      ...TransferFragment
    }
  }
`;

export const GET_ACTIVE_VALIDATORS = gql`
  ${VALIDATOR_FRAGMENT}
  query GetActiveValidators {
    validators(order_by: { total_stake: desc }) {
      ...ValidatorFragment
    }
    # Get validator bonds separately since there's no relationship
    validator_bonds(order_by: { block_number: desc }, limit: 100) {
      validator_public_key
      stake
      token_decimals
      block_number
    }
    # Get recent blocks to count proposers client-side
    blocks(limit: 1000, order_by: { block_number: desc }) {
      block_hash
      block_number
      proposer
    }
  }
`;

export const GET_NETWORK_STATS = gql`
  query GetNetworkStats {
    network_stats(limit: 1, order_by: {id: desc}) {
      id
      total_validators
      active_validators
      validators_in_quarantine
      consensus_participation
      consensus_status
      block_number
      timestamp
    }
  }
`;

// Subscriptions
export const SUBSCRIBE_TO_NEW_BLOCKS = gql`
  ${BLOCK_FRAGMENT}
  ${DEPLOYMENT_FRAGMENT}
  subscription SubscribeToNewBlocks($limit: Int = 5) {
    blocks(
      limit: $limit
      order_by: { block_number: desc }
    ) {
      ...BlockFragment
      deployments {
        ...DeploymentFragment
      }
    }
  }
`;

export const SUBSCRIBE_TO_NEW_TRANSFERS = gql`
  ${TRANSFER_FRAGMENT}
  subscription SubscribeToNewTransfers($limit: Int = 10) {
    transfers(
      limit: $limit
      order_by: { created_at: desc }
    ) {
      ...TransferFragment
    }
  }
`;

export const SUBSCRIBE_TO_NEW_DEPLOYMENTS = gql`
  ${DEPLOYMENT_FRAGMENT}
  subscription SubscribeToNewDeployments($limit: Int = 20) {
    deployments(
      limit: $limit
      order_by: { created_at: desc }
    ) {
      ...DeploymentFragment
    }
  }
`;

// Indexer Status Query
export const GET_INDEXER_STATUS = gql`
  query GetIndexerStatus {
    blocks(order_by: { block_number: desc }, limit: 1) {
      block_hash
      block_number
      timestamp
    }
  }
`;

// Pending deploys: the indexer snapshot of the node deploy buffers. The sig
// becomes the deploy_id once the deploy is included in a block.
export const PENDING_DEPLOY_FRAGMENT = gql`
  fragment PendingDeployFragment on pending_deploys {
    sig
    deployer
    deployer_address
    timestamp
    phlo_price
    phlo_limit
    valid_after_block_number
    shard_id
    expiration_timestamp
    is_rejected
    fetched_at
    included_deployment {
      deploy_id
      block_number
      block_hash
    }
  }
`;

// The pending list is read live over the GraphQL WebSocket (WATCH_*), with the
// matching GET_* query as the HTTP polling fallback. Hasura allows only one root
// field in a subscription, so the list and the indexer status are separate.
export const GET_PENDING_DEPLOYS = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  query GetPendingDeploys($limit: Int!) {
    pending_deploys(order_by: [{ timestamp: desc }, { sig: asc }], limit: $limit) {
      ...PendingDeployFragment
    }
  }
`;

export const WATCH_PENDING_DEPLOYS = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  subscription WatchPendingDeploys($limit: Int!) {
    pending_deploys(order_by: [{ timestamp: desc }, { sig: asc }], limit: $limit) {
      ...PendingDeployFragment
    }
  }
`;

// Pending rows are deploy submissions, not transfers. This address filter reads
// the deploys that the wallet submitted; the indexer has no recipient field.
export const GET_ADDRESS_PENDING_DEPLOYS = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  query GetAddressPendingDeploys($address: String!, $limit: Int!) {
    pending_deploys(
      where: { deployer_address: { _eq: $address } }
      order_by: [{ timestamp: desc }, { sig: asc }]
      limit: $limit
    ) {
      ...PendingDeployFragment
    }
  }
`;

export const WATCH_ADDRESS_PENDING_DEPLOYS = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  subscription WatchAddressPendingDeploys($address: String!, $limit: Int!) {
    pending_deploys(
      where: { deployer_address: { _eq: $address } }
      order_by: [{ timestamp: desc }, { sig: asc }]
      limit: $limit
    ) {
      ...PendingDeployFragment
    }
  }
`;

// The indexer writes pending_deploys_status only while it reads validator
// buffers (PENDING_DEPLOYS_NODES); without it the explorer hides the view.
export const GET_PENDING_DEPLOYS_STATUS = gql`
  query GetPendingDeploysStatus {
    indexer_state(where: { key: { _eq: "pending_deploys_status" } }) {
      key
      value
      updated_at
    }
  }
`;

export const WATCH_PENDING_DEPLOYS_STATUS = gql`
  subscription WatchPendingDeploysStatus {
    indexer_state(where: { key: { _eq: "pending_deploys_status" } }) {
      key
      value
      updated_at
    }
  }
`;

export const GET_PENDING_DEPLOY = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  query GetPendingDeploy($sig: String!) {
    pending_deploys(where: { sig: { _eq: $sig } }) {
      ...PendingDeployFragment
      term
    }
  }
`;

export const WATCH_PENDING_DEPLOY = gql`
  ${PENDING_DEPLOY_FRAGMENT}
  subscription WatchPendingDeploy($sig: String!) {
    pending_deploys(where: { sig: { _eq: $sig } }) {
      ...PendingDeployFragment
      term
    }
  }
`;

// Tells a page that waits for a pending deploy when the indexer stored it.
export const GET_DEPLOYMENT_INDEXED = gql`
  query GetDeploymentIndexed($deployId: String!) {
    deployments(where: { deploy_id: { _eq: $deployId } }, limit: 1) {
      deploy_id
    }
  }
`;

export const WATCH_DEPLOYMENT_INDEXED = gql`
  subscription WatchDeploymentIndexed($deployId: String!) {
    deployments(where: { deploy_id: { _eq: $deployId } }, limit: 1) {
      deploy_id
    }
  }
`;
