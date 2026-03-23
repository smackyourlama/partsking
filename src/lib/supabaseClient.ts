import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null | undefined

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient ?? null
  }

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

  if (!url || !anonKey) {
    cachedClient = null
    return null
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  })

  return cachedClient
}
