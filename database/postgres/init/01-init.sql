-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS grid;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS monitoring;

-- Create users table
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create scenarios table
CREATE TABLE grid.scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id),
    base_topology_version VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create telemetry table (TimescaleDB hypertable)
CREATE TABLE monitoring.telemetry (
    time TIMESTAMPTZ NOT NULL,
    element_id VARCHAR(100) NOT NULL,
    element_type VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DOUBLE PRECISION,
    unit VARCHAR(20),
    quality VARCHAR(20) DEFAULT 'good'
);

-- Convert to hypertable
SELECT create_hypertable('monitoring.telemetry', 'time');

-- Create indexes
CREATE INDEX idx_telemetry_element_time ON monitoring.telemetry (element_id, time DESC);
CREATE INDEX idx_users_email ON auth.users (email);
CREATE INDEX idx_scenarios_owner ON grid.scenarios (owner_id);