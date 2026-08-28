import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken } from '../features/auth/sessionManager'
import { env } from './env'

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  accessToken: getValidAccessToken,
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
