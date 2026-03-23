import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const envFiles = ['.env.local', '.env']

for (const file of envFiles) {
  const resolved = path.resolve(process.cwd(), file)
  if (existsSync(resolved)) {
    dotenv.config({ path: resolved, override: false })
  }
}
