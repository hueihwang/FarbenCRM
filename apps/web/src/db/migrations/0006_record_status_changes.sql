-- Stage history: one row per change of a status attribute (e.g. a deal's Stage).
-- Written by services/stage-history.ts on every record create and update.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "record_status_changes" (
  "id" text PRIMARY KEY NOT NULL,
  "record_id" text NOT NULL REFERENCES "records"("id") ON DELETE CASCADE,
  "attribute_id" text NOT NULL REFERENCES "attributes"("id") ON DELETE CASCADE,
  "from_status_id" text,
  "from_title" text,
  "to_status_id" text,
  "to_title" text,
  "changed_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "changed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "record_status_changes_record_idx"
  ON "record_status_changes" ("record_id", "changed_at");

-- Backfill: records that already have a status get one starting entry,
-- dated when that value was written. Skipped for records with history.
INSERT INTO "record_status_changes"
  ("id", "record_id", "attribute_id", "to_status_id", "to_title", "changed_by", "changed_at")
SELECT gen_random_uuid()::text, rv."record_id", rv."attribute_id", rv."text_value", s."title", rv."created_by", rv."created_at"
FROM "record_values" rv
JOIN "attributes" a ON a."id" = rv."attribute_id" AND a."type" = 'status'
LEFT JOIN "statuses" s ON s."id" = rv."text_value"
WHERE rv."text_value" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "record_status_changes" c
    WHERE c."record_id" = rv."record_id" AND c."attribute_id" = rv."attribute_id"
  );
