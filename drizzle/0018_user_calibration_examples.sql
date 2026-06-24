CREATE TABLE "user_calibration_examples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "transcript" text NOT NULL,
  "expected_json" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_calibration_examples_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "user_calibration_examples_user_id_idx"
  ON "user_calibration_examples" ("user_id", "created_at" DESC);
