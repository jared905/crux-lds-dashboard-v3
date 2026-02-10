-- Add engagement metrics to video_snapshots for comprehensive daily tracking

ALTER TABLE video_snapshots
ADD COLUMN IF NOT EXISTS likes INTEGER,
ADD COLUMN IF NOT EXISTS comments INTEGER,
ADD COLUMN IF NOT EXISTS shares INTEGER,
ADD COLUMN IF NOT EXISTS subscribers_lost INTEGER;

COMMENT ON COLUMN video_snapshots.likes IS 'Daily likes count';
COMMENT ON COLUMN video_snapshots.comments IS 'Daily comments added';
COMMENT ON COLUMN video_snapshots.shares IS 'Daily shares count';
COMMENT ON COLUMN video_snapshots.subscribers_lost IS 'Subscribers lost on this day';
