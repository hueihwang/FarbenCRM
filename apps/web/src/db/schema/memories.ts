import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";
import { users } from "./auth";

export const aiMemories = pgTable(
  "ai_memories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: text("category").notNull().default("general"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("ai_memories_user_workspace").on(table.userId, table.workspaceId),
    index("ai_memories_category").on(table.category),
  ]
);
