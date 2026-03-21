-- Add competitor and landscape data columns to audits table
ALTER TABLE audits ADD COLUMN IF NOT EXISTS competitor_data JSONB;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS landscape_data JSONB;

COMMENT ON COLUMN audits.competitor_data IS 'Stored competitor channel data fetched during audit (up to 5 channels with metrics)';
COMMENT ON COLUMN audits.landscape_data IS 'AI-generated landscape analysis (positioning, saturation, white space)';
