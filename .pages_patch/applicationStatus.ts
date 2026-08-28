import type { AppRole, InterestStatus } from '../../types/domain'

const transitions: Record<InterestStatus, InterestStatus[]> = {
  interested: ['profile_reviewed', 'profile_shared', 'shortlisted', 'rejected', 'on_hold', 'closed', 'withdrawn'],
  profile_reviewed: ['profile_shared', 'shortlisted', 'rejected', 'on_hold', 'closed'],
  profile_shared: ['shortlisted', 'interview', 'rejected', 'on_hold', 'closed'],
  shortlisted: ['interview', 'selected', 'rejected', 'on_hold', 'closed'],
  interview: ['selected', 'rejected', 'on_hold', 'closed'],
  selected: ['closed'],
  rejected: ['closed'],
  on_hold: ['profile_reviewed', 'profile_shared', 'shortlisted', 'interview', 'rejected', 'closed'],
  closed: [],
  withdrawn: [],
}

export function allowedNextStatuses(current: InterestStatus, role: AppRole): InterestStatus[] {
  if (role === 'candidate') return current === 'interested' ? ['withdrawn'] : []
  if (role === 'associate' || role === 'admin' || role === 'super_admin') {
    return transitions[current].filter((status) => status !== 'withdrawn')
  }
  return []
}
