#!/bin/sh
set -eu

echo "[PRE] Initializing database schema and generating sample data"

# Use psql in the init context. The official entrypoint ensures the server is available
# and the POSTGRES_USER/POSTGRES_DB environment variables are set.

echo "[PRE] Creating base schema..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS events (
    event_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    device_id BIGINT,
    event_type VARCHAR(50),
    event_ts TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    payload JSONB
);

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT PRIMARY KEY,
    signup_ts TIMESTAMP,
    country CHAR(2),
    plan VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS devices (
    device_id BIGINT PRIMARY KEY,
    device_type VARCHAR(30),
    os_version VARCHAR(20)
);
SQL

echo "[PRE] Inserting sample users (1,000)..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO users (user_id, signup_ts, country, plan)
SELECT i,
       now() - ((floor(random()*365)::int || ' days')::interval),
       (ARRAY['US','VN','JP','KR','CN','IN','GB','FR','DE','CA'])[floor(random()*10)+1],
       (ARRAY['free','basic','pro','enterprise'])[floor(random()*4)+1]
FROM generate_series(1,1000) AS s(i);
SQL

echo "[PRE] Inserting sample devices (500)..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO devices (device_id, device_type, os_version)
SELECT i,
       (ARRAY['mobile','tablet','desktop','smartwatch','tv'])[floor(random()*5)+1],
       (ARRAY['iOS 15','iOS 16','Android 11','Android 12','Android 13'])[floor(random()*5)+1]
FROM generate_series(1,500) AS s(i);
SQL

echo "[PRE] Inserting sample events (10,000)..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO events (user_id, device_id, event_type, event_ts, payload)
SELECT (floor(random()*1000)+1)::bigint,
       (CASE WHEN random() > 0.1 THEN (floor(random()*500)+1)::bigint ELSE NULL END),
       (ARRAY['page_view','click','purchase','login','logout','search','add_to_cart','checkout','signup'])[floor(random()*9)+1],
       now() - ((floor(random()*181)::int || ' days')::interval + (floor(random()*24)::int || ' hours')::interval + (floor(random()*60)::int || ' minutes')::interval),
       to_jsonb(json_build_object(
           'flag', (CASE WHEN random() > 0.5 THEN 'true' ELSE 'false' END),
           'value', (floor(random()*1000)+1),
           'category', (ARRAY['A','B','C','D'])[floor(random()*4)+1]
       ))
FROM generate_series(1,10000) AS s(i);
SQL

echo "[PRE] Recording initial database size..."
mkdir -p /shared || true
INITIAL_SIZE=$(psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT pg_database_size('$POSTGRES_DB');" | tr -d '[:space:]') || INITIAL_SIZE="0"
echo "$INITIAL_SIZE" > /shared/initial_size.txt || true

echo "[PRE] Sample data generation complete"

