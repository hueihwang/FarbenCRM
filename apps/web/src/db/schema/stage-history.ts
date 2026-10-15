import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { records } from "./records";
import { attributes } from "./objects";
import { users } from "./auth";

/**
 * One row per change of a status attribute (e.g. a deal's Stage).
 * Status ids are not foreign keys so history survives a stage being
 * deleted; the titles are snapshotted for the same reason.
 */
export const recordStatusChanges = pgTable(
  "record_status_changes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    attributeId: text("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
    fromStatusId: text("from_status_id"),
    fromTitle: text("from_title"),
    toStatusId: text("to_status_id"),
    toTitle: text("to_title"),
    changedBy: text("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
  },
  (table) => [index("record_status_changes_record_idx").on(table.recordId, table.changedAt)]
);
