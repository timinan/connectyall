ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phones" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "preferred_channel" text;
