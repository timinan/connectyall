ALTER TABLE "capture_diagnostics" ADD COLUMN "user_feedback_rating" text;
ALTER TABLE "capture_diagnostics" ADD COLUMN "user_feedback_text" text;
ALTER TABLE "capture_diagnostics" ADD COLUMN "feedback_submitted_at" timestamptz;

CREATE INDEX "capture_diagnostics_feedback_idx"
  ON "capture_diagnostics" ("user_feedback_rating", "feedback_submitted_at" DESC);
