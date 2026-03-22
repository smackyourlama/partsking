import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type RefreshRunStatus = 'pending' | 'running' | 'success' | 'failed'

export interface RefreshRunRecord {
  id: string
  partNumber: string
  runType: string
  status: RefreshRunStatus
  listings?: number
  notes?: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
}

export interface RefreshRunMeta {
  runType?: string
  notes?: string
  listings?: number
}

const LOG_PATH = path.resolve(process.cwd(), 'data/refresh_runs.jsonl')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase: SupabaseClient | null =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null

function appendLocal(record: RefreshRunRecord) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8')
}

function deriveCount(payload: unknown): number | undefined {
  if (typeof payload === 'number' && Number.isFinite(payload)) {
    return payload
  }
  if (Array.isArray(payload)) {
    return payload.length
  }
  if (payload && typeof payload === 'object') {
    const candidate = (payload as { count?: unknown; length?: unknown })
    if (typeof candidate.count === 'number' && Number.isFinite(candidate.count)) {
      return candidate.count
    }
    if (typeof candidate.length === 'number' && Number.isFinite(candidate.length)) {
      return candidate.length
    }
  }
  return undefined
}

async function finalizeRun(
  seed: RefreshRunRecord,
  status: Exclude<RefreshRunStatus, 'pending' | 'running'>,
  listings: number | undefined,
  error?: unknown,
) {
  const finishedAt = new Date().toISOString()
  const durationMs = Date.parse(finishedAt) - Date.parse(seed.startedAt)
  const next: RefreshRunRecord = {
    ...seed,
    status,
    finishedAt,
    durationMs,
    listings: typeof listings === 'number' ? listings : seed.listings,
    notes: seed.notes ?? (error instanceof Error ? error.message : undefined),
  }

  if (supabase && seed.id.startsWith('sb-')) {
    const upstreamId = seed.id.replace('sb-', '')
    const { error: updateError } = await supabase
      .from('refresh_runs')
      .update({
        status,
        finished_at: finishedAt,
        notes: next.notes,
        duration_ms: durationMs,
        listings,
      })
      .eq('id', upstreamId)
    if (updateError) {
      console.error('[telemetry] failed to update refresh_runs', updateError)
    }
  }

  appendLocal(next)
}

export async function withRefreshRun<T>(
  partNumber: string,
  meta: RefreshRunMeta,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString()
  const runType = meta.runType ?? 'incremental'
  let seed: RefreshRunRecord = {
    id: crypto.randomUUID(),
    partNumber,
    runType,
    status: 'running',
    listings: meta.listings,
    notes: meta.notes,
    startedAt,
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('refresh_runs')
        .insert({
          part_number: partNumber,
          run_type: runType,
          status: 'running',
          notes: meta.notes,
          started_at: startedAt,
        })
        .select('id')
        .single()
      if (error) {
        console.error('[telemetry] failed to insert refresh_runs row', error)
      } else if (data?.id) {
        seed = { ...seed, id: `sb-${data.id}` }
      }
    } catch (insertError) {
      console.error('[telemetry] unexpected failure inserting refresh_runs', insertError)
    }
  }

  try {
    const result = await action()
    const listings = typeof meta.listings === 'number' ? meta.listings : deriveCount(result)
    await finalizeRun(seed, 'success', listings)
    return result
  } catch (error) {
    await finalizeRun(seed, 'failed', undefined, error)
    throw error
  }
}

export async function listRefreshRuns(limit = 25): Promise<RefreshRunRecord[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('refresh_runs')
        .select('id, part_number, run_type, status, notes, started_at, finished_at, listings, duration_ms')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) {
        console.error('[telemetry] failed to load refresh_runs from supabase', error)
        return []
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        partNumber: row.part_number,
        runType: row.run_type,
        status: (row.status as RefreshRunStatus) || 'pending',
        listings: typeof row.listings === 'number' ? row.listings : undefined,
        notes: row.notes ?? undefined,
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? undefined,
        durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
      }))
    } catch (error) {
      console.error('[telemetry] unexpected Supabase fetch error', error)
      return []
    }
  }

  if (!fs.existsSync(LOG_PATH)) {
    return []
  }

  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line) as RefreshRunRecord
        } catch (error) {
          console.error('[telemetry] failed to parse local log line', error)
          return null
        }
      })
      .filter((entry): entry is RefreshRunRecord => Boolean(entry))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    return parsed.slice(0, limit)
  } catch (error) {
    console.error('[telemetry] unable to read local refresh log', error)
    return []
  }
}
