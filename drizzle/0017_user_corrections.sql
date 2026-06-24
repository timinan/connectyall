CREATE TABLE "user_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "field" text NOT NULL,
  "original_text" text NOT NULL,
  "corrected_text" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "used_count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "user_corrections_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "user_corrections_user_id_created_at_idx"
  ON "user_corrections" ("user_id", "created_at" DESC);

CREATE UNIQUE INDEX "user_corrections_unique_triple_idx"
  ON "user_corrections" ("user_id", "field", "original_text", "corrected_text");
