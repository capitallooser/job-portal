import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalentBridgeSession } from './authTypes'
import {
  SESSION_STORAGE_KEY,
  clearSession,
  getCurrentUserId,
  getValidAccessToken,
  readSession,
  setRefreshImplementation,
  writeSession,
} from './sessionManager'

const session: TalentBridgeSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1_700_000_600,
  tokenType: 'bearer',
  user: { id: 'candidate-1', email: 'candidate1@neepanlok.com' },
}

describe('TalentBridge session manager', () => {
  beforeEach(() => {
    localStorage.clear()
    setRefreshImplementation(async () => {
      throw new Error('unexpected refresh')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips the versioned TalentBridge session', () => {
    writeSession(session)
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toContain('candidate-1')
    expect(readSession()).toEqual(session)
    expect(getCurrentUserId()).toBe('candidate-1')
  })

  it('clears malformed stored sessions instead of trusting them', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{"accessToken":42}')
    expect(readSession()).toBeNull()
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('clears synchronously', () => {
    writeSession(session)
    clearSession()
    expect(readSession()).toBeNull()
  })

  it('returns a healthy access token without refreshing', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    writeSession({ ...session, expiresAt: 1_700_000_061 })
    const refresh = vi.fn()
    setRefreshImplementation(refresh)

    await expect(getValidAccessToken()).resolves.toBe('access-1')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes once for concurrent callers and stores rotated tokens', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    writeSession({ ...session, expiresAt: 1_700_000_030 })
    let resolveRefresh!: (value: TalentBridgeSession) => void
    const refresh = vi.fn(() => new Promise<TalentBridgeSession>((resolve) => {
      resolveRefresh = resolve
    }))
    setRefreshImplementation(refresh)

    const a = getValidAccessToken()
    const b = getValidAccessToken()
    expect(refresh).toHaveBeenCalledTimes(1)

    resolveRefresh({
      ...session,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: 1_700_003_600,
    })

    await expect(Promise.all([a, b])).resolves.toEqual(['access-2', 'access-2'])
    expect(readSession()?.refreshToken).toBe('refresh-2')
  })

  it('clears the session when refresh definitively fails', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    writeSession({ ...session, expiresAt: 1_700_000_030 })
    setRefreshImplementation(async () => {
      throw new Error('refresh token expired')
    })

    await expect(getValidAccessToken()).rejects.toThrow('refresh token expired')
    expect(readSession()).toBeNull()
  })
})
