-- Initial schema for ASI-Chain Indexer
-- Version: 001

-- Enable extensions
create EXTENSION IF NOT EXISTS "uuid-ossp";

-- Blocks table
create TABLE IF NOT EXISTS blocks (
    block_number BIGINT PRIMARY KEY,
    block_hash VARCHAR(64) UNIQUE NOT NULL,
    parent_hash VARCHAR(64) NOT NULL,
    timestamp BIGINT NOT NULL,
    proposer VARCHAR(160) NOT NULL,
    state_hash VARCHAR(64),
    seq_num INTEGER,
    sig VARCHAR(200),
    sig_algorithm VARCHAR(20),
    shard_id VARCHAR(20),
    extra_bytes TEXT,
    version INTEGER,
    deployment_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index idx_blocks_hash on blocks(block_hash);
create index idx_blocks_timestamp on blocks(timestamp desc);
create index idx_blocks_proposer on blocks(proposer);
create index idx_blocks_created_at on blocks(created_at desc);

-- Deployments table
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
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

create index idx_deployments_block_hash on deployments(block_hash);
create index idx_deployments_block_number on deployments(block_number);
create index idx_deployments_deployer on deployments(deployer);
create index idx_deployments_timestamp on deployments(timestamp desc);
create index idx_deployments_errored on deployments(errored);

-- Transfers table
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

-- Validators table
create TABLE IF NOT EXISTS validators (
    public_key VARCHAR(200) PRIMARY KEY,
    name VARCHAR(50),
    total_stake BIGINT DEFAULT 0,
    first_seen_block BIGINT,
    last_seen_block BIGINT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Validator bonds table
create TABLE IF NOT EXISTS validator_bonds (
    id BIGSERIAL PRIMARY KEY,
    block_hash VARCHAR(64) NOT NULL REFERENCES blocks(block_hash) ON delete CASCADE,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON delete CASCADE,
    validator_public_key VARCHAR(200) NOT NULL REFERENCES validators(public_key),
    stake BIGINT NOT NULL,
    UNIQUE(block_hash, validator_public_key)
);

create index idx_validator_bonds_block_number on validator_bonds(block_number);
create index idx_validator_bonds_validator on validator_bonds(validator_public_key);

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
    ('schema_version', '001')
ON CONFLICT (key) DO NOTHING;

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

-- Balance states table for tracking bonded vs unbonded balances
create TABLE IF NOT EXISTS balance_states (
    id BIGSERIAL PRIMARY KEY,
    address VARCHAR(150) NOT NULL,
    block_number BIGINT NOT NULL REFERENCES blocks(block_number) ON DELETE CASCADE,
    unbonded_balance_dust BIGINT NOT NULL DEFAULT 0,
    unbonded_balance_asi NUMERIC(20, 8) NOT NULL DEFAULT 0,
    bonded_balance_dust BIGINT NOT NULL DEFAULT 0,
    bonded_balance_asi NUMERIC(20, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    UNIQUE(address, block_number)
);

create INDEX idx_balance_states_address ON balance_states(address);
create INDEX idx_balance_states_block ON balance_states(block_number DESC);
create INDEX idx_balance_states_updated ON balance_states(updated_at DESC);