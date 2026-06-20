ALTER TABLE "interactions" ADD COLUMN "user_id" uuid;
ALTER TABLE "interactions" ADD COLUMN "audio_r2_key" text;
ALTER TABLE "interactions" ADD COLUMN "mime_type" text;
CREATE INDEX "interactions_status_occurred_at_idx" ON "interactions" ("status", "occurred_at");
