-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('NFL', 'MLB', 'NBA', 'NHL', 'SOCCER', 'BOXING', 'SPORTS_BETTING');

-- CreateEnum
CREATE TYPE "QueryRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QueryRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('YOUTUBE_API', 'AUTOGEN', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'SHORTLISTED', 'DISMISSED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "MomentType" AS ENUM ('HIGHLIGHT', 'QUOTE', 'ANALYSIS', 'CONTROVERSY', 'BREAKING_NEWS', 'TRADE_RUMOR', 'INJURY_UPDATE', 'STAT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('ORG_CREATED', 'ORG_UPDATED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'QUERY_CREATED', 'QUERY_UPDATED', 'QUERY_DELETED', 'QUERY_RUN_STARTED', 'QUERY_RUN_COMPLETED', 'CANDIDATE_STATUS_CHANGED', 'EXPORT_STARTED', 'EXPORT_COMPLETED', 'LOG_ENTRY_CREATED', 'LOG_ENTRY_DELETED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'JSON');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('MANUAL', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    "plan" VARCHAR(50) NOT NULL DEFAULT 'free',
    "youtube_api_key_encrypted" TEXT,
    "youtube_quota_used" INTEGER NOT NULL DEFAULT 0,
    "youtube_quota_reset_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "email" VARCHAR(320) NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" VARCHAR(255),
    "image" VARCHAR(500),
    "preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "manager_id" TEXT,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "token" VARCHAR(100) NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "message" VARCHAR(500),
    "invited_by_user_id" TEXT NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_definitions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "org_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sport" "Sport" NOT NULL,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "recency_days" INTEGER NOT NULL DEFAULT 7,
    "channel_ids" JSONB NOT NULL DEFAULT '[]',
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_scheduled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_type" "ScheduleType" NOT NULL DEFAULT 'MANUAL',
    "schedule_cron" VARCHAR(100),
    "schedule_timezone" VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),

    CONSTRAINT "query_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_runs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "query_definition_id" TEXT NOT NULL,
    "triggered_by_user_id" TEXT,
    "status" "QueryRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggered_by" "QueryRunTrigger" NOT NULL DEFAULT 'MANUAL',
    "job_id" VARCHAR(100),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "videos_fetched" INTEGER NOT NULL DEFAULT 0,
    "transcripts_fetched" INTEGER NOT NULL DEFAULT 0,
    "videos_processed" INTEGER NOT NULL DEFAULT 0,
    "candidates_produced" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER DEFAULT 0,
    "progress_message" VARCHAR(500),
    "error_message" TEXT,

    CONSTRAINT "query_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_videos" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "youtube_video_id" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "channel_id" VARCHAR(30) NOT NULL,
    "channel_title" VARCHAR(255) NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "thumbnail_url" VARCHAR(500),
    "view_count" INTEGER,
    "like_count" INTEGER,
    "comment_count" INTEGER,
    "has_captions" BOOLEAN,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "source_type" "TranscriptSource" NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "full_text" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" TEXT NOT NULL,
    "transcript_id" TEXT NOT NULL,
    "start_seconds" INTEGER NOT NULL,
    "end_seconds" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "org_id" TEXT NOT NULL,
    "query_run_id" TEXT NOT NULL,
    "query_definition_id" TEXT NOT NULL,
    "youtube_video_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "ai_summary" TEXT,
    "why_relevant" TEXT,
    "entities_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_moments" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "type" "MomentType" NOT NULL DEFAULT 'HIGHLIGHT',
    "start_seconds" INTEGER NOT NULL,
    "end_seconds" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supporting_quote" TEXT,

    CONSTRAINT "candidate_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_entries" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "org_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "candidate_id" TEXT,
    "sport" "Sport",
    "title" VARCHAR(255) NOT NULL,
    "note" TEXT NOT NULL,
    "youtube_url" VARCHAR(500),
    "shared" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "event_type" "AuditEventType" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "org_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "format" "ExportFormat" NOT NULL DEFAULT 'CSV',
    "export_type" VARCHAR(100) NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "candidate_ids" JSONB NOT NULL DEFAULT '[]',
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "file_size_bytes" BIGINT,
    "download_url" VARCHAR(1000),
    "file_name" VARCHAR(255),
    "file_data" TEXT,
    "expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_deleted_at_idx" ON "organizations"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "org_memberships_org_id_idx" ON "org_memberships"("org_id");

-- CreateIndex
CREATE INDEX "org_memberships_user_id_idx" ON "org_memberships"("user_id");

-- CreateIndex
CREATE INDEX "org_memberships_org_id_role_idx" ON "org_memberships"("org_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "org_memberships_org_id_user_id_key" ON "org_memberships"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_org_id_idx" ON "invites"("org_id");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE INDEX "invites_token_idx" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_status_idx" ON "invites"("status");

-- CreateIndex
CREATE INDEX "invites_expires_at_idx" ON "invites"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invites_email_org_id_key" ON "invites"("email", "org_id");

-- CreateIndex
CREATE INDEX "query_definitions_org_id_idx" ON "query_definitions"("org_id");

-- CreateIndex
CREATE INDEX "query_definitions_org_id_sport_idx" ON "query_definitions"("org_id", "sport");

-- CreateIndex
CREATE INDEX "query_definitions_org_id_created_by_user_id_idx" ON "query_definitions"("org_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "query_definitions_is_scheduled_next_run_at_idx" ON "query_definitions"("is_scheduled", "next_run_at");

-- CreateIndex
CREATE INDEX "query_definitions_deleted_at_idx" ON "query_definitions"("deleted_at");

-- CreateIndex
CREATE INDEX "query_runs_org_id_created_at_idx" ON "query_runs"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "query_runs_org_id_status_idx" ON "query_runs"("org_id", "status");

-- CreateIndex
CREATE INDEX "query_runs_query_definition_id_idx" ON "query_runs"("query_definition_id");

-- CreateIndex
CREATE INDEX "youtube_videos_org_id_idx" ON "youtube_videos"("org_id");

-- CreateIndex
CREATE INDEX "youtube_videos_org_id_published_at_idx" ON "youtube_videos"("org_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "youtube_videos_org_id_youtube_video_id_key" ON "youtube_videos"("org_id", "youtube_video_id");

-- CreateIndex
CREATE INDEX "transcripts_org_id_video_id_idx" ON "transcripts"("org_id", "video_id");

-- CreateIndex
CREATE INDEX "transcript_segments_transcript_id_start_seconds_idx" ON "transcript_segments"("transcript_id", "start_seconds");

-- CreateIndex
CREATE INDEX "candidates_query_run_id_rank_idx" ON "candidates"("query_run_id", "rank");

-- CreateIndex
CREATE INDEX "candidates_org_id_status_idx" ON "candidates"("org_id", "status");

-- CreateIndex
CREATE INDEX "candidates_query_definition_id_idx" ON "candidates"("query_definition_id");

-- CreateIndex
CREATE INDEX "candidates_deleted_at_idx" ON "candidates"("deleted_at");

-- CreateIndex
CREATE INDEX "candidate_moments_candidate_id_start_seconds_idx" ON "candidate_moments"("candidate_id", "start_seconds");

-- CreateIndex
CREATE INDEX "log_entries_org_id_created_at_idx" ON "log_entries"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "log_entries_candidate_id_idx" ON "log_entries"("candidate_id");

-- CreateIndex
CREATE INDEX "log_entries_deleted_at_idx" ON "log_entries"("deleted_at");

-- CreateIndex
CREATE INDEX "audit_events_org_id_created_at_idx" ON "audit_events"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "export_jobs_org_id_created_at_idx" ON "export_jobs"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_definitions" ADD CONSTRAINT "query_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_definitions" ADD CONSTRAINT "query_definitions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_query_definition_id_fkey" FOREIGN KEY ("query_definition_id") REFERENCES "query_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "youtube_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_query_run_id_fkey" FOREIGN KEY ("query_run_id") REFERENCES "query_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_query_definition_id_fkey" FOREIGN KEY ("query_definition_id") REFERENCES "query_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_youtube_video_id_fkey" FOREIGN KEY ("youtube_video_id") REFERENCES "youtube_videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_moments" ADD CONSTRAINT "candidate_moments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
