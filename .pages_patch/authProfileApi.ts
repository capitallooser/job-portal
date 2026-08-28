import { supabase } from '../../lib/supabase'
import type { AppRole, SessionProfile } from '../../types/domain'

const ROLE_PRIORITY: AppRole[] = ['super_admin', 'admin', 'associate', 'candidate']

export function resolveEffectiveRole(roles: AppRole[]): AppRole {
  const assigned = new Set(roles)
  return ROLE_PRIORITY.find((role) => assigned.has(role)) ?? 'candidate'
}

export async function fetchSessionProfileByUserId(userId: string): Promise<SessionProfile> {
  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])
  if (profileError) throw profileError
  if (roleError) throw roleError
  const effectiveRole = resolveEffectiveRole((roles ?? []).map((row) => row.role as AppRole))
  return { ...profile, role: effectiveRole } as SessionProfile
}
