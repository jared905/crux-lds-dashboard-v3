-- Atomizer V3.1: Thread-based beat analysis architecture
-- No schema changes needed: beat_analysis JSONB column accommodates richer structure.
-- Add GIN index for future thread-based queries.

CREATE INDEX IF NOT EXISTS idx_transcripts_beat_analysis_threads
  ON transcripts USING gin ((beat_analysis -> 'threads'));
