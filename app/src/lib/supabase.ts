import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Only the project URL and the public key reach the browser. Both are safe to
// ship. The service role key, agent keys and the Microsoft secret never do.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null when no project is configured. The app then runs on invented sample data. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null

export const usingSampleData = supabase === null
