-- 058: Add US state (province) and city data to audience snapshots

ALTER TABLE channel_audience_snapshots
  ADD COLUMN IF NOT EXISTS province_data JSONB,
  ADD COLUMN IF NOT EXISTS city_data JSONB;

COMMENT ON COLUMN channel_audience_snapshots.province_data IS
  'US states: { "US-CA": { views, watchHours, pct }, "US-TX": { ... } }';
COMMENT ON COLUMN channel_audience_snapshots.city_data IS
  'Top cities: { "Los Angeles": { views, watchHours }, "Provo": { ... } }';
