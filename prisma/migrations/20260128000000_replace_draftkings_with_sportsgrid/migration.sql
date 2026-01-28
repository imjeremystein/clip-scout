-- Replace DRAFTKINGS_API and DRAFTKINGS_SCRAPE with SPORTSGRID_API in SourceType enum

-- First, update any existing sources that use DraftKings to use SportsGrid
UPDATE "sources" SET "type" = 'SPORTSGRID_API' WHERE "type" IN ('DRAFTKINGS_API', 'DRAFTKINGS_SCRAPE');

-- Remove old enum values and add new one
-- PostgreSQL requires creating a new enum and swapping
ALTER TYPE "SourceType" RENAME TO "SourceType_old";

CREATE TYPE "SourceType" AS ENUM ('TWITTER_SEARCH', 'TWITTER_LIST', 'RSS_FEED', 'WEBSITE_SCRAPE', 'SPORTSGRID_API', 'ESPN_API');

-- Update the column to use the new enum
ALTER TABLE "sources" ALTER COLUMN "type" TYPE "SourceType" USING "type"::text::"SourceType";

-- Drop the old enum
DROP TYPE "SourceType_old";
