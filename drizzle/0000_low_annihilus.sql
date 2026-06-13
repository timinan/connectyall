CREATE TYPE "public"."source" AS ENUM('voice', 'audio', 'video', 'manual');--> statement-breakpoint
CREATE TYPE "public"."usage_event_kind" AS ENUM('capture', 'card_render', 'report');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"company" text,
	"emails" text[] DEFAULT '{}' NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes_summary" text,
	"last_touched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"source" "source" NOT NULL,
	"structured_data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint,
	"kind" "usage_event_kind" NOT NULL,
	"cost_usd" numeric(10, 4),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"telegram_user_id" bigint PRIMARY KEY NOT NULL,
	"telegram_username" text,
	"display_name" text NOT NULL,
	"tagline" text,
	"photo_r2_url" text,
	"self_intro" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"consent_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_telegram_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("telegram_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_name_idx" ON "contacts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_user_id_last_touched_idx" ON "contacts" USING btree ("user_id","last_touched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_contact_id_idx" ON "interactions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_occurred_at_idx" ON "usage_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_user_occurred_at_idx" ON "usage_events" USING btree ("user_id","occurred_at");