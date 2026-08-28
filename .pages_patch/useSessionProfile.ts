import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { AppRole, SessionProfile } from '../../types/domain'

export async function fetchSessionProfile(userId?: string): Promise<SessionProfile | null> {
  let resolvedUserId = userId

  if (!resolvedUserId) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    resolvedUserId = sessionData.session?.user.id
  }

  if (!resolvedUserId) return null

  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', resolvedUserId).single(),
    supabase.from('user_roles').select('role').eq('user_id', resolvedUserId),
  ])

  if (profileError) throw profileError
  if (roleError) throw roleError

  const priority: AppRole[] = ['super_admin', 'admin', 'associate', 'candidate']
  const assigned = new Set((roles ?? []).map((r: { role: AppRole }) => r.role))
  const role = priority.find((r) => assigned.has(r)) ?? 'candidate'

  return { ...profile, role } as SessionProfile
}

export function useSessionProfile() {
  return useQuery({ queryKey: ['session-profile'], queryFn: () => fetchSessionProfile(), staleTime: 15_000 })
}
