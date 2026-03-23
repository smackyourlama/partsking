import { readFileSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'

const envFiles = ['.env.local', '.env'] as const
for (const file of envFiles) {
  dotenv.config({ path: file, override: false })
}

const rawConnectionString = process.env.SUPABASE_MIGRATION_URL
if (!rawConnectionString) {
  console.error('Missing SUPABASE_MIGRATION_URL; cannot run SQL script.')
  process.exit(1)
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
    console.warn('[applySql] Unable to override host, using raw connection string', error)
    return rawConnectionString
  }
}

const connectionString = buildConnectionString()

if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

const relativePath = process.argv[2]
if (!relativePath) {
  console.error('Usage: pnpm tsx scripts/applySql.ts <sql-file>')
  process.exit(1)
}

const sqlPath = path.resolve(process.cwd(), relativePath)
const sql = readFileSync(sqlPath, 'utf8')

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    await client.query(sql)
    console.log(`Applied SQL from ${relativePath}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to apply SQL file', error)
  process.exit(1)
})
