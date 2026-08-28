import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
  profileEq: vi.fn(),
  profileSingle: vi.fn(),
  rolesEq: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
  },
}))

import { fetchSessionProfile } from './useSessionProfile'

describe('fetchSessionProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'session-user' } } } })
    mocks.profileSingle.mockResolvedValue({
      data: {
        id: 'login-user',
        full_name: 'Admin User',
        email: 'admin@example.com',
        mobile: null,
        approval_status: 'approved',
        is_blocked: false,
        approved_at: null,
        created_at: '2026-08-28T00:00:00Z',
      },
      error: null,
    })
    mocks.rolesEq.mockResolvedValue({ data: [{ role: 'candidate' }, { role: 'super_admin' }], error: null })
    mocks.profileEq.mockReturnValue({ single: mocks.profileSingle })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') return { select: vi.fn(() => ({ eq: mocks.profileEq })) }
      if (table === 'user_roles') return { select: vi.fn(() => ({ eq: mocks.rolesEq })) }
      throw new Error(`Unexpected table: ${table}`)
    })
  })

  it('uses the user id returned by login without reacquiring the auth session', async () => {
    const profile = await fetchSessionProfile('login-user')

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.profileEq).toHaveBeenCalledWith('id', 'login-user')
    expect(mocks.rolesEq).toHaveBeenCalledWith('user_id', 'login-user')
    expect(profile?.role).toBe('super_admin')
  })
})
