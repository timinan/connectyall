-- 1. New enum
CREATE TYPE "public"."interaction_status" AS ENUM('processing', 'ready', 'failed');

-- 2. Add new user columns (still keep old PK column)
ALTER TABLE "users" ADD COLUMN "id" uuid DEFAULT gen_random_uuid();
UPDATE "users" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "users" ADD COLUMN "email" text;
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;

-- 3. Rebuild contacts.user_id to point at users.id
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_user_id_users_telegram_user_id_fk";
ALTER TABLE "contacts" ADD COLUMN "user_id_new" uuid;
UPDATE "contacts" SET "user_id_new" = (SELECT "id" FROM "users" WHERE "users"."telegram_user_id" = "contacts"."user_id");
ALTER TABLE "contacts" ALTER COLUMN "user_id_new" SET NOT NULL;
ALTER TABLE "contacts" DROP COLUMN "user_id";
ALTER TABLE "contacts" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "contacts_user_id_idx" ON "contacts" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "contacts_user_name_idx" ON "contacts" USING btree ("user_id","name");
CREATE INDEX IF NOT EXISTS "contacts_user_id_last_touched_idx" ON "contacts" USING btree ("user_id","last_touched_at");

-- 4. Swap users PK
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";
ALTER TABLE "users" ADD PRIMARY KEY ("id");

-- 5. Add unique indexes for email + telegram_user_id
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users"("email") WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_user_id_unique" ON "users"("telegram_user_id") WHERE "telegram_user_id" IS NOT NULL;

-- 6. Interactions changes — relax contact_id, add status enum
ALTER TABLE "interactions" ALTER COLUMN "contact_id" DROP NOT NULL;
ALTER TABLE "interactions" ADD COLUMN "status" "public"."interaction_status" DEFAULT 'ready' NOT NULL;

-- 7. Rebuild usage_events.user_id from bigint (telegram_user_id) to uuid (users.id)
ALTER TABLE "usage_events" ADD COLUMN "user_id_new" uuid;
UPDATE "usage_events" SET "user_id_new" = (SELECT "id" FROM "users" WHERE "users"."telegram_user_id" = "usage_events"."user_id");
ALTER TABLE "usage_events" DROP COLUMN "user_id";
ALTER TABLE "usage_events" RENAME COLUMN "user_id_new" TO "user_id";

-- Recreate the indexes that were on the old user_id column
CREATE INDEX IF NOT EXISTS "usage_events_occurred_at_idx" ON "usage_events"("occurred_at");
CREATE INDEX IF NOT EXISTS "usage_events_user_occurred_at_idx" ON "usage_events"("user_id","occurred_at");
