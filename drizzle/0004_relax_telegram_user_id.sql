-- Drop the legacy NOT NULL on telegram_user_id (left over from when it was the PK)
ALTER TABLE "users" ALTER COLUMN "telegram_user_id" DROP NOT NULL;

-- Same for display_name — Better Auth's magic-link doesn't supply one for new email-only sign-ups.
-- Backfill via email local-part will happen application-side; allow NULL until that lands.
ALTER TABLE "users" ALTER COLUMN "display_name" DROP NOT NULL;
