import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const connectionString = process.env.SUPABASE_MIGRATION_URL
if (!connectionString) {
  throw new Error('Missing SUPABASE_MIGRATION_URL env var for Drizzle migrations')
}

export default defineConfig({
  schema: './server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
})
