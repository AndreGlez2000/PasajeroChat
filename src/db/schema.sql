-- schema.sql
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_variants (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    direction TEXT
);

CREATE TABLE IF NOT EXISTS stops (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER REFERENCES route_variants(id) ON DELETE CASCADE,
    stop_number INTEGER NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    variant_id INTEGER REFERENCES route_variants(id) ON DELETE CASCADE,
    stop_id INTEGER REFERENCES stops(id) ON DELETE CASCADE,
    user_psid TEXT NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    confirm_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS confirmations (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    user_psid TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
