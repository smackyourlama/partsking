import { pruneListings } from '../server/db.js'

const hours = process.argv[2] ? Number(process.argv[2]) : 24
if (Number.isNaN(hours) || hours <= 0) {
  console.error('Usage: pnpm prune:cache [hours]')
  process.exit(1)
}

async function main() {
  await pruneListings(hours)
  console.log(`Deleted cached rows older than ${hours} hours.`)
}

void main()
