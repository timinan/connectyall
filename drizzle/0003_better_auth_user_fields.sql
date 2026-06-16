-- Add the user fields Better Auth requires by default
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

-- Backfill email_verified from the existing timestamp column
UPDATE "users" SET "email_verified" = ("email_verified_at" IS NOT NULL);

-- Backfill image from photo_r2_url so existing profile photos still work
UPDATE "users" SET "image" = "photo_r2_url" WHERE "image" IS NULL;
