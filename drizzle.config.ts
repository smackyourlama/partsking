import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local', override: false })
config()

const rawConnectionString = process.env.SUPABASE_MIGRATION_URL
if (!rawConnectionString) {
  throw new Error('Missing SUPABASE_MIGRATION_URL env var for Drizzle migrations')
}

const buildConnectionString = () => {
  const poolerHost = process.env.SUPABASE_POOLER_HOST?.trim()
  const poolerPort = process.env.SUPABASE_POOLER_PORT?.trim()

  if (!poolerHost) {
    return rawConnectionString
  }

  try {
    const url = new URL(rawConnectionString)
    url.hostname = poolerHost
    url.port = poolerPort || url.port || '6543'
    return url.toString()
  } catch (error) {
    console.warn('[drizzle] Unable to parse SUPABASE_MIGRATION_URL for host override', error)
    return rawConnectionString
  }
}

export default defineConfig({
  schema: './server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: buildConnectionString(),
  },
})
