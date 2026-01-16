-- Supabase Database Schema for FX Tracker
-- Run this SQL in your Supabase SQL Editor

-- Create exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
    id BIGSERIAL PRIMARY KEY,
    from_currency VARCHAR(10) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    open DECIMAL(20, 10) NOT NULL,
    high DECIMAL(20, 10) NOT NULL,
    low DECIMAL(20, 10) NOT NULL,
    close DECIMAL(20, 10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint for upsert
    CONSTRAINT unique_rate_per_day UNIQUE (from_currency, to_currency, date)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair 
    ON exchange_rates (from_currency, to_currency);
    
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date 
    ON exchange_rates (date DESC);
    
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_date 
    ON exchange_rates (from_currency, to_currency, date DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access for all
CREATE POLICY "Allow public read access" ON exchange_rates
    FOR SELECT
    USING (true);

-- Create policy to allow insert/update for authenticated or anon users
-- (In production, you might want to restrict this to authenticated users only)
CREATE POLICY "Allow public insert" ON exchange_rates
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update" ON exchange_rates
    FOR UPDATE
    USING (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sample query to verify data
-- SELECT * FROM exchange_rates ORDER BY date DESC LIMIT 10;

-- Sample query to get specific pair
-- SELECT * FROM exchange_rates 
-- WHERE from_currency = 'USD' AND to_currency = 'CNY'
-- ORDER BY date DESC
-- LIMIT 100;
