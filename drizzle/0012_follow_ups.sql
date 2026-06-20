CREATE TABLE "follow_ups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "interaction_id" uuid REFERENCES "interactions"("id") ON DELETE SET NULL,
  "topic" text NOT NULL,
  "due_at" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "done_at" timestamptz
);
CREATE INDEX "follow_ups_user_pending_due_idx"
  ON "follow_ups" ("user_id", "status", "due_at");
CREATE INDEX "follow_ups_contact_idx" ON "follow_ups" ("contact_id");
