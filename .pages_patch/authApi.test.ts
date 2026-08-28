import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../lib/queryClient'
import { signIn, signOut } from './authApi'
import { loginWithPassword, revokeSession } from './portalAuthApi'
import { clearSession, getCurrentAccessToken, writeSession } from './sessionManager'

vi.mock('./portalAuthApi', () => ({ loginWithPassword: vi.fn(), revokeSession: vi.fn() }))
vi.mock('./sessionManager', () => ({ clearSession: vi.fn(), getCurrentAccessToken: vi.fn(), writeSession: vi.fn() }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: {} } }))
const session = { accessToken:'access-1', refreshToken:'refresh-1', expiresAt:1_700_003_600, tokenType:'bearer' as const, user:{ id:'candidate-1', email:'candidate1@neepanlok.com' } }

describe('authApi login/logout', () => {
  beforeEach(() => vi.clearAllMocks())
  it('writes the returned session after successful password login', async () => {
    vi.mocked(loginWithPassword).mockResolvedValue(session)
    await signIn({ email:'candidate1@neepanlok.com', password:'Password123!' })
    expect(vi.mocked(clearSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(writeSession).mock.invocationCallOrder[0])
    expect(writeSession).toHaveBeenCalledWith(session)
    expect(queryClient.clear).toHaveBeenCalled()
  })
  it('clears locally without waiting for remote revoke', async () => {
    vi.mocked(getCurrentAccessToken).mockReturnValue('access-1')
    vi.mocked(revokeSession).mockReturnValue(new Promise<void>(() => undefined))
    await signOut()
    expect(clearSession).toHaveBeenCalled()
    expect(queryClient.clear).toHaveBeenCalled()
    expect(revokeSession).toHaveBeenCalledWith('access-1')
  })
})
