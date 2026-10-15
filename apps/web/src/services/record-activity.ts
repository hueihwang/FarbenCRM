import { db } from "@/db";
import { records, taskRecords } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/** Mark records as active now (drives "rotting" deals). Ignores empty ids. */
export async function touchRecords(recordIds: (string | null | undefined)[]) {
  const ids = [...new Set(recordIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  await db.update(records).set({ lastActivityAt: new Date() }).where(inArray(records.id, ids));
}

/** Mark every record linked to a task as active now. */
export async function touchTaskRecords(taskId: string) {
  const links = await db.select({ recordId: taskRecords.recordId }).from(taskRecords).where(eq(taskRecords.taskId, taskId));
  await touchRecords(links.map((l) => l.recordId));
}
