import { pgTable, serial, varchar, timestamp, text, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 系统表 - 禁止删除
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 审核记录表
export const reviewRecords = pgTable(
  "review_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    file_name: text("file_name").notNull(),
    review_type: varchar("review_type", { length: 20 }).notNull(),
    review_mode: varchar("review_mode", { length: 20 }).notNull(),
    user_role: varchar("user_role", { length: 20 }).notNull().default("general"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    result: jsonb("result"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("review_records_status_idx").on(table.status),
    index("review_records_review_type_idx").on(table.review_type),
    index("review_records_created_at_idx").on(table.created_at),
  ]
);
