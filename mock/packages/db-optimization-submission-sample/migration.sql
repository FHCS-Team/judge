-- Migration Script: Add indexes and optimize schema for query performance
-- This file contains all schema modifications needed to optimize the queries

-- Add indexes for Query 1: Event counts by type for Pro users (last 30 days)
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(event_ts);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- Add indexes for Query 2: Distinct device types for Vietnamese users with flag
CREATE INDEX IF NOT EXISTS idx_events_device_id ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);
CREATE INDEX IF NOT EXISTS idx_events_payload_flag ON events USING gin ((payload->'flag'));

-- Add indexes for Query 3: Top 100 users by purchases (last 90 days)
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, event_ts);
CREATE INDEX IF NOT EXISTS idx_events_user_type ON events(user_id, event_type);

-- Analyze tables to update statistics
ANALYZE events;
ANALYZE users;
ANALYZE devices;
