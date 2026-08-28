import { afterEach, describe, expect, it, vi } from 'vitest'
import { passwordSignInDirect } from './directAuth'

describe('passwordSignInDirect', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists a successful password session in Supabase browser storage', async () => {
    const storage = new Map<string, string>()
    const storageAdapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    }
    const user = { id: 'candidate-1', email: 'candidate1@neepanlok.com' }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access-123',
      refresh_token: 'refresh-123',
      token_type: 'bearer',
      expires_in: 3600,
      user,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await passwordSignInDirect(
      { email: user.email, password: 'Password123!' },
      {
        supabaseUrl: 'https://vizfrptpkdofnvykbtbh.supabase.co',
        publishableKey: 'public-test-key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        storage: storageAdapter,
        now: () => 1_700_000_000_000,
      },
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://vizfrptpkdofnvykbtbh.supabase.co/auth/v1/token?grant_type=password')
    expect(result.user).toEqual(user)
    expect(result.session.access_token).toBe('access-123')

    const stored = JSON.parse(storage.get('sb-vizfrptpkdofnvykbtbh-auth-token') ?? 'null')
    expect(stored).toMatchObject({
      access_token: 'access-123',
      refresh_token: 'refresh-123',
      expires_at: 1_700_003_600,
      user,
    })
  })

  it('surfaces Supabase password errors without persisting a session', async () => {
    const setItem = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'invalid_credentials',
      msg: 'Invalid login credentials',
    }), { status: 400, headers: { 'content-type': 'application/json' } }))

    await expect(passwordSignInDirect(
      { email: 'candidate1@neepanlok.com', password: 'wrong' },
      {
        supabaseUrl: 'https://vizfrptpkdofnvykbtbh.supabase.co',
        publishableKey: 'public-test-key',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        storage: { getItem: () => null, setItem, removeItem: () => undefined },
      },
    )).rejects.toThrow('Invalid login credentials')

    expect(setItem).not.toHaveBeenCalled()
  })
})
