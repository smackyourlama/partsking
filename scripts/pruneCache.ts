import { pruneListings } from '../server/db'

const hours = process.argv[2] ? Number(process.argv[2]) : 24
if (Number.isNaN(hours) || hours <= 0) {
  console.error('Usage: pnpm prune:cache [hours]')
  process.exit(1)
}

pruneListings(hours)
console.log(`Deleted cached rows older than ${hours} hours.`)
