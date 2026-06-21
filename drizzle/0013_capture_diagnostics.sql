CREATE TABLE "capture_diagnostics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interaction_id" uuid REFERENCES "interactions"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "outcome" text NOT NULL DEFAULT 'pending',
  "audio_download_ms" integer,
  "transcribe_ms" integer,
  "extract_ms" integer,
  "contact_persist_ms" integer,
  "render_ms" integer,
  "card_upload_ms" integer,
  "total_ms" integer,
  "audio_bytes" integer,
  "audio_mime" text,
  "transcript_chars" integer,
  "llm_provider" text,
  "llm_model" text,
  "contact_name" text,
  "follow_ups_extracted" integer,
  "follow_ups_drifted" boolean DEFAULT false,
  "error_stage" text,
  "error_message" text
);
CREATE INDEX "capture_diagnostics_recorded_at_idx" ON "capture_diagnostics" ("recorded_at" DESC);
CREATE INDEX "capture_diagnostics_outcome_idx" ON "capture_diagnostics" ("outcome");
