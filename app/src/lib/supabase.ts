import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Only the project URL and the public key reach the browser. Both are safe to
// ship. The service role key, agent keys and the Microsoft secret never do.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null when no project is configured. The app then runs on invented sample data. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // 'implicit' so an emailed link works in whichever browser opens it. With
        // 'pkce' the link only works in the browser that asked for it, which a
        // link read on another screen or pre-opened by a mail scanner breaks.
        auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null

export const usingSampleData = supabase === null
