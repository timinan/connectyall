-- Track when a web user has completed initial profile setup
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;

-- Existing bot users have already onboarded via /start — mark them as done so they don't get redirected
UPDATE "users" SET "onboarded_at" = COALESCE("onboarded_at", "created_at")
  WHERE "telegram_user_id" IS NOT NULL;
