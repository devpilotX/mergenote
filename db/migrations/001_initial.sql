-- Mergenote initial schema
-- Creates the licenses table for storing license keys and subscription info

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licenses (
  id SERIAL PRIMARY KEY,
  license_key VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  tier VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (tier IN ('pro', 'team')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  paypal_subscription_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_paypal_sub ON licenses(paypal_subscription_id);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
