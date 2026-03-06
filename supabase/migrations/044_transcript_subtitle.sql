-- Add subtitle column to transcripts for user-provided content description
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS subtitle TEXT;
