-- Comprehensive Initial Schema for ASI-Chain Indexer
-- Version: 000 (Single Complete Migration)
-- Includes all enhancements: extended fields, balance tracking, network stats, epoch transitions

-- Enable extensions
create EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CORE BLOCKCHAIN TABLES
-- =============================================

-- Blocks table with all enhanced fields
create TABLE IF NOT EXISTS blocks (
    block_number BIGINT PRIMARY KEY,
    block_hash VARCHAR(64) UNIQUE NOT NULL,
    parent_hash VARCHAR(64) NOT NULL,
    timestamp BIGINT NOT NULL,
    proposer VARCHAR(160) NOT NULL,
    state_hash VARCHAR(64),
    state_root_hash VARCHAR(64),
    pre_state_hash VARCHAR(64),
    seq_num INTEGER,
    sig VARCHAR(200),
    sig_algorithm VARCHAR(20),
    shard_id VARCHAR(20),
    extra_bytes TEXT,
    version INTEGER,
    deployment_count INTEGER DEFAULT 0,
    finalization_status VARCHAR(20) DEFAULT 'finalized',
    bonds_map JSONB,
    justifications JSONB,
    fault_tolerance NUMERIC(5,4),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index idx_blocks_hash on blocks(block_hash);
create index idx_blocks_timestamp on blocks(timestamp desc);
create index idx_blocks_proposer on blocks(proposer);
create index idx_blocks_created_at on blocks(created_at desc);
create index IF NOT EXISTS idx_blocks_hash_partial ON blocks(block_hash varchar_pattern_ops);

-- Deployments table with enhanced fields
create TABLE IF NOT EXISTS deployments (
    deploy_id VARCHAR(200) PRIMARY KEY,
    block_hash VARCHAR(64) NOT NULL REFERENCES blocks(block_hash) ON delete CASCADE,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON delete CASCADE,
    deployer VARCHAR(200) NOT NULL,
    term TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    sig VARCHAR(200) NOT NULL,
    sig_algorithm VARCHAR(20) DEFAULT 'secp256k1',
    phlo_price BIGINT DEFAULT 1,
    phlo_limit BIGINT DEFAULT 1000000,
    phlo_cost BIGINT DEFAULT 0,
    valid_after_block_number BIGINT,
    errored BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    deployment_type VARCHAR(50),
    seq_num INTEGER,
    shard_id VARCHAR(20),
    status VARCHAR(20) DEFAULT 'included',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index idx_deployments_block_hash on deployments(block_hash);
create index idx_deployments_block_number on deployments(block_number);
create index idx_deployments_deployer on deployments(deployer);
create index idx_deployments_timestamp on deployments(timestamp desc);
create index idx_deployments_errored on deployments(errored);
create index IF NOT EXISTS idx_deployments_status ON deployments(status);
create index IF NOT EXISTS idx_deployments_deploy_id_partial ON deployments(deploy_id varchar_pattern_ops);
create index IF NOT EXISTS idx_deployments_deployer_partial ON deployments(deployer varchar_pattern_ops);
create index IF NOT EXISTS idx_deployments_type ON deployments(deployment_type);

-- Transfers table with extended address fields
create TABLE IF NOT EXISTS transfers (
    id BIGSERIAL PRIMARY KEY,
    deploy_id VARCHAR(200) NOT NULL REFERENCES deployments(deploy_id) ON delete CASCADE,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON delete CASCADE,
    from_address VARCHAR(150) NOT NULL,
    to_address VARCHAR(150) NOT NULL,
    amount_dust BIGINT NOT NULL,
    amount_asi NUMERIC(20, 8) NOT NULL,
    status VARCHAR(20) DEFAULT 'success',
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index idx_transfers_deploy_id on transfers(deploy_id);
create index idx_transfers_block_number on transfers(block_number desc);
create index idx_transfers_from on transfers(from_address);
create index idx_transfers_to on transfers(to_address);
create index idx_transfers_created_at on transfers(created_at desc);
create index IF NOT EXISTS idx_transfers_from_address ON transfers(from_address);
create index IF NOT EXISTS idx_transfers_to_address ON transfers(to_address);

-- =============================================
-- VALIDATOR AND STAKING TABLES
-- =============================================

-- Validators table with extended name field for full public keys
create TABLE IF NOT EXISTS validators (
    public_key VARCHAR(200) PRIMARY KEY,
    name VARCHAR(160),  -- Extended to accommodate full public keys
    total_stake BIGINT DEFAULT 0,
    first_seen_block BIGINT,
    last_seen_block BIGINT,
    status VARCHAR(20) DEFAULT 'bonded',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index IF NOT EXISTS idx_validators_status ON validators(status);

-- Validator bonds table (flexible foreign key constraint)
create TABLE IF NOT EXISTS validator_bonds (
    id BIGSERIAL PRIMARY KEY,
    block_hash VARCHAR(64) NOT NULL REFERENCES blocks(block_hash) ON delete CASCADE,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON delete CASCADE,
    validator_public_key VARCHAR(200) NOT NULL,
    stake BIGINT NOT NULL,
    UNIQUE(block_hash, validator_public_key)
);

create index idx_validator_bonds_block_number on validator_bonds(block_number);
create index idx_validator_bonds_validator on validator_bonds(validator_public_key);

-- Block validators junction table for tracking validators per block
create TABLE IF NOT EXISTS block_validators (
    block_hash VARCHAR(64) REFERENCES blocks(block_hash) ON delete CASCADE,
    validator_public_key VARCHAR(160),
    PRIMARY KEY (block_hash, validator_public_key)
);

-- =============================================
-- BALANCE TRACKING TABLES
-- =============================================

-- Balance states table for tracking bonded vs unbonded balances
create TABLE IF NOT EXISTS balance_states (
    id BIGSERIAL PRIMARY KEY,
    address VARCHAR(150) NOT NULL,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON delete CASCADE,
    unbonded_balance_dust BIGINT NOT NULL DEFAULT 0,
    unbonded_balance_asi NUMERIC(20, 8) NOT NULL DEFAULT 0,
    bonded_balance_dust BIGINT NOT NULL DEFAULT 0,
    bonded_balance_asi NUMERIC(20, 8) NOT NULL DEFAULT 0,
    total_balance_dust BIGINT GENERATED ALWAYS AS (unbonded_balance_dust + bonded_balance_dust) STORED,
    total_balance_asi NUMERIC(20, 8) GENERATED ALWAYS AS (unbonded_balance_asi + bonded_balance_asi) STORED,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(address, block_number)
);

create index idx_balance_states_address on balance_states(address);
create index idx_balance_states_block on balance_states(block_number desc);
create index idx_balance_states_updated on balance_states(updated_at desc);

-- =============================================
-- NETWORK STATISTICS TABLES
-- =============================================

-- Epoch transitions table
create TABLE IF NOT EXISTS epoch_transitions (
    id BIGSERIAL PRIMARY KEY,
    epoch_number BIGINT UNIQUE NOT NULL,
    start_block BIGINT NOT NULL,
    end_block BIGINT NOT NULL,
    active_validators INTEGER NOT NULL,
    quarantine_length INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

create index IF NOT EXISTS idx_epoch_transitions_epoch_number ON epoch_transitions(epoch_number);
create index IF NOT EXISTS idx_epoch_blocks ON epoch_transitions(start_block, end_block);

-- Network stats table
create TABLE IF NOT EXISTS network_stats (
    id BIGSERIAL PRIMARY KEY,
    block_number BIGINT NOT NULL,
    total_validators INTEGER NOT NULL,
    active_validators INTEGER NOT NULL,
    validators_in_quarantine INTEGER DEFAULT 0,
    consensus_participation NUMERIC(5,2) NOT NULL,
    consensus_status VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

create index IF NOT EXISTS idx_network_stats_block_number ON network_stats(block_number);
create index IF NOT EXISTS idx_network_stats_timestamp ON network_stats(timestamp);

-- =============================================
-- INDEXER STATE TABLE
-- =============================================

-- Indexer state table
create TABLE IF NOT EXISTS indexer_state (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Insert initial state
insert into indexer_state (key, value) values
    ('last_indexed_block', '0'),
    ('indexer_version', '1.0.0'),
    ('schema_version', '000')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- VIEWS FOR ANALYTICS
-- =============================================

-- Create a view for network statistics
create or replace view network_stats_view as
with block_times as (
    select
        block_number,
        timestamp,
        lag(timestamp) over (order by block_number desc) as prev_timestamp,
        proposer
    from blocks
    where block_number > 0
    order by block_number desc
    LIMIT 100
)
select
    count(*) as total_blocks,
    avg(case
        when prev_timestamp is not null
        then (prev_timestamp - timestamp) / 1000.0  -- Convert to seconds
        else null
    end) as avg_block_time_seconds,
    min(timestamp) as earliest_block_time,
    max(timestamp) as latest_block_time
from block_times;

-- =============================================
-- TRIGGERS AND FUNCTIONS
-- =============================================

-- Create function to update deployment count
create or replace function update_block_deployment_count()
RETURNS trigger AS $$
begin
    if TG_OP = 'INSERT' then
        update blocks
        set deployment_count = deployment_count + 1
        where block_hash = NEW.block_hash;
    elsif TG_OP = 'DELETE' then
        update blocks
        set deployment_count = deployment_count - 1
        where block_hash = OLD.block_hash;
    end if;
    return null;
end;
$$ LANGUAGE plpgsql;

-- Create trigger for deployment count
create trigger update_deployment_count
after insert or delete on deployments
for each row EXECUTE function update_block_deployment_count();

-- Create function to notify on new blocks
create or replace function notify_new_block()
RETURNS trigger AS $$
begin
    PERFORM pg_notify(
        'new_block',
        json_build_object(
            'block_number', NEW.block_number,
            'block_hash', NEW.block_hash,
            'timestamp', NEW.timestamp
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new block notifications
create trigger new_block_notify
after insert on blocks
for each row EXECUTE function notify_new_block();

-- Create function to notify on new transfers
create or replace function notify_new_transfer()
RETURNS trigger AS $$
begin
    PERFORM pg_notify(
        'new_transfer',
        json_build_object(
            'id', NEW.id,
            'from_address', NEW.from_address,
            'to_address', NEW.to_address,
            'amount_asi', NEW.amount_asi,
            'block_number', NEW.block_number
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new transfer notifications
create trigger new_transfer_notify
after insert on transfers
for each row EXECUTE function notify_new_transfer();

-- =============================================
-- TABLE COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE blocks IS 'Core blockchain blocks with all enhanced fields for F1R3FLY/RChain';
COMMENT ON TABLE deployments IS 'Smart contract deployments with enhanced tracking and status';
COMMENT ON TABLE transfers IS 'ASI token transfers extracted from deployments';
COMMENT ON TABLE validators IS 'Network validators with extended name field for full public keys';
COMMENT ON TABLE validator_bonds IS 'Historical validator bonding states per block';
COMMENT ON TABLE balance_states IS 'Address balance tracking with bonded/unbonded separation';
COMMENT ON TABLE epoch_transitions IS 'Network epoch transitions and validator set changes';
COMMENT ON TABLE network_stats IS 'Network statistics captured at specific blocks';
COMMENT ON TABLE indexer_state IS 'Indexer operational state and configuration';

COMMENT ON COLUMN blocks.pre_state_hash IS 'Pre-state hash from enhanced block data';
COMMENT ON COLUMN blocks.justifications IS 'Full justifications data as JSONB';
COMMENT ON COLUMN blocks.fault_tolerance IS 'Fault tolerance metric for the block';
COMMENT ON COLUMN blocks.bonds_map IS 'Validator bonds map as JSONB';
COMMENT ON COLUMN deployments.status IS 'Deploy status: pending/included/error';
COMMENT ON COLUMN deployments.deployment_type IS 'Type classification for deployments';
COMMENT ON COLUMN validators.status IS 'Validator status: active/bonded/quarantine/inactive';
COMMENT ON COLUMN validators.name IS 'Validator name (can store full public key up to 160 chars)';
COMMENT ON COLUMN balance_states.total_balance_dust IS 'Auto-computed total balance in dust units';
COMMENT ON COLUMN balance_states.total_balance_asi IS 'Auto-computed total balance in ASI units';