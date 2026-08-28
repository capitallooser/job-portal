import { describe, expect, it, vi } from 'vitest'
import { loginWithPassword, refreshSession } from './portalAuthApi'

const session = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 1_700_003_600,
  tokenType: 'bearer' as const,
  user: { id: 'u1', email: 'candidate1@neepanlok.com' },
}

describe('portal auth browser transport', () => {
  it('sends a CORS-simple text/plain request to portal-auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }))

    await loginWithPassword(
      'candidate1@neepanlok.com',
      'Password123!',
      fetchImpl as unknown as typeof fetch,
    )

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:54321/functions/v1/portal-auth')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' })
    expect(String(url)).not.toContain('/auth/v1/token')
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: 'login',
      email: 'candidate1@neepanlok.com',
    })
  })

  it('surfaces a friendly authentication error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Invalid email or password' }),
      { status: 400 },
    ))

    await expect(loginWithPassword(
      'candidate1@neepanlok.com',
      'wrong-pass',
      fetchImpl as unknown as typeof fetch,
    )).rejects.toThrow('Invalid email or password')
  })

  it('uses the same portal boundary for refresh', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(session), { status: 200 }))
    await refreshSession('refresh-token-long-enough', fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/functions/v1/portal-auth')
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'refresh' })
  })
})
