-- Rotting deals: per-stage "rots after X days" and a last-activity time per record.
-- Safe to run more than once.

ALTER TABLE "statuses" ADD COLUMN IF NOT EXISTS "rotting_days" integer;

ALTER TABLE "records" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp;

-- Backfill once: latest of record edit, note added or edited, linked task created or completed.
UPDATE "records" r SET "last_activity_at" = GREATEST(
  r."updated_at",
  COALESCE((SELECT max(GREATEST(n."created_at", n."updated_at")) FROM "notes" n WHERE n."record_id" = r."id"), r."updated_at"),
  COALESCE((
    SELECT max(GREATEST(t."created_at", COALESCE(t."completed_at", t."created_at")))
    FROM "tasks" t JOIN "task_records" tr ON tr."task_id" = t."id"
    WHERE tr."record_id" = r."id"
  ), r."updated_at")
)
WHERE r."last_activity_at" IS NULL;

ALTER TABLE "records" ALTER COLUMN "last_activity_at" SET DEFAULT now();
ALTER TABLE "records" ALTER COLUMN "last_activity_at" SET NOT NULL;
