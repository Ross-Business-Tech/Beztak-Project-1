// Connection to the team's demo Supabase project (login + shared file storage).
//
// These two values are meant to be public: Supabase's "publishable" key only identifies the
// project. What people can do is controlled by the security rules in Supabase
// (see supabase/setup.sql). NEVER put the secret / service_role key in this app.
// When a client gets their own copy, only these two values change (or set
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY at build time).
import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lfcghafpkztkzfwwuopn.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZE6aJg14avEL2UjkxgEe1w_n31nQ4fW'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

export const FILES_BUCKET = 'team-files'

// Turn Supabase errors into plain-language messages.
export function friendlyError(error) {
  const m = (error?.message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email or password isn\'t right. Check them again, or ask your team lead.'
  if (m.includes('email not confirmed')) return 'This account hasn\'t been confirmed yet. In Supabase, open the user and confirm it.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can\'t reach the sign-in service. Check your internet connection, or the Supabase project may be paused (free projects pause after about a week without use).'
  if (m.includes('bucket not found')) return 'File storage isn\'t set up yet. Someone with access to Supabase needs to run supabase/setup.sql once.'
  if (m.includes('row-level security') || m.includes('unauthorized') || m.includes('not allowed')) return 'You don\'t have permission to do that. Sign in again, or check the storage rules in supabase/setup.sql.'
  if (m.includes('exceeded') || m.includes('too large') || m.includes('payload')) return 'That file is too large (limit 10 MB).'
  return error?.message || 'Something went wrong. Please try again.'
}
