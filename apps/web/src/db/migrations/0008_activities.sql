-- Activities: a type per task and whether its deadline has a time of day.
-- Safe to run more than once.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'follow_up';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "has_due_time" boolean NOT NULL DEFAULT false;

-- Date-only deadlines used to be saved as midnight UTC (08:00 in Malaysia), which
-- made them overdue the morning they were due. Move them to the end of that day
-- in Malaysia (15:59:59 UTC). Rows already moved no longer match, so a re-run is a no-op.
UPDATE "tasks"
SET "deadline" = "deadline" + interval '15 hours 59 minutes 59 seconds'
WHERE "has_due_time" = false AND "deadline" IS NOT NULL AND "deadline"::time = '00:00:00';
