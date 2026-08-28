import { describe, expect, it, vi } from 'vitest'
import { loginWithPassword, refreshSession } from './portalAuthApi'

const authSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 1_700_003_600,
  token_type: 'bearer',
  user: { id: 'u1', email: 'candidate1@neepanlok.com' },
}

describe('portal auth browser transport', () => {
  it('signs in through a CORS-simple direct Auth REST request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(authSession), { status: 200 }))

    const result = await loginWithPassword(
      'candidate1@neepanlok.com',
      'Password123!',
      fetchImpl as unknown as typeof fetch,
    )

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/v1/token?grant_type=password&apikey=')
    expect(url).not.toContain('/functions/v1/')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' })
    expect((init.headers as Record<string, string>).apikey).toBeUndefined()
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'candidate1@neepanlok.com',
      password: 'Password123!',
    })
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 1_700_003_600,
      tokenType: 'bearer',
      user: { id: 'u1', email: 'candidate1@neepanlok.com' },
    })
  })

  it('surfaces invalid credentials from Auth REST', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      { status: 400 },
    ))

    await expect(loginWithPassword(
      'candidate1@neepanlok.com',
      'wrong-pass',
      fetchImpl as unknown as typeof fetch,
    )).rejects.toThrow('Invalid email or password')
  })

  it('refreshes through the same CORS-simple direct Auth REST transport', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(authSession), { status: 200 }))

    const result = await refreshSession('refresh-token-long-enough', fetchImpl as unknown as typeof fetch)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/v1/token?grant_type=refresh_token&apikey=')
    expect(url).not.toContain('/functions/v1/')
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' })
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'refresh-token-long-enough' })
    expect(result.accessToken).toBe('access-token')
  })
})
