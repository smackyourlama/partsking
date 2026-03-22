import {
  boolean,
  doublePrecision,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const parts = pgTable(
  'parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    partNumber: text('part_number').notNull(),
    lastCachedAt: timestamp('last_cached_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    partNumberIdx: uniqueIndex('parts_part_number_unique').on(table.partNumber),
  }),
)

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    website: text('website'),
    notes: text('notes'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('suppliers_slug_unique').on(table.slug),
  }),
)

export const partListings = pgTable(
  'part_listings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    partNumber: text('part_number').notNull(),
    source: text('source').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    price: text('price'),
    stockStatus: text('stock_status'),
    confidence: doublePrecision('confidence').notNull(),
    payload: jsonb('payload').notNull(),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    partNumberIdx: uniqueIndex('part_listings_part_source_url_unique').on(table.partNumber, table.source, table.url),
  }),
)

export const refreshRuns = pgTable('refresh_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  partNumber: text('part_number').notNull(),
  runType: text('run_type').default('incremental').notNull(),
  status: text('status').default('pending').notNull(),
  notes: text('notes'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export type InsertListing = typeof partListings.$inferInsert
export type InsertPart = typeof parts.$inferInsert
export type InsertSupplier = typeof suppliers.$inferInsert
export type InsertRefreshRun = typeof refreshRuns.$inferInsert
