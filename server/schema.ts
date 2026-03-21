import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const partListings = sqliteTable('part_listings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  partNumber: text('part_number').notNull(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  price: text('price'),
  stockStatus: text('stock_status'),
  confidence: real('confidence').notNull(),
  payload: text('payload'),
  scrapedAt: text('scraped_at').default(sql`CURRENT_TIMESTAMP`),
})

export type InsertListing = typeof partListings.$inferInsert
