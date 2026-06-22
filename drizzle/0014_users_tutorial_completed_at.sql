ALTER TABLE "users" ADD COLUMN "tutorial_completed_at" timestamptz;

-- Backfill: anyone who already has a contact has effectively finished onboarding,
-- so don't surprise them with coach marks on next login.
UPDATE "users"
SET "tutorial_completed_at" = now()
WHERE "id" IN (SELECT DISTINCT "user_id" FROM "contacts");
