import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Application-wide configurable settings, stored as a single singleton
 * row (id is always the literal "singleton").
 *
 * Currently holds only the handicap calculation cap; more settings can
 * be added to this same row as the app grows. There is deliberately no
 * admin UI to edit this yet — the row (and its default) exists so the
 * handicap engine has a single, well-defined place to read the cap from
 * rather than a hardcoded constant.
 */
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("singleton"),

  /** Maximum handicap the calculation engine will ever return. */
  maxHandicap: integer("max_handicap").notNull().default(18),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;
