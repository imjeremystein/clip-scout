-- Add sportsbook column to odds_snapshots table
ALTER TABLE "odds_snapshots" ADD COLUMN "sportsbook" VARCHAR(50);
