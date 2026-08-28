import { refreshSession } from './portalAuthApi'
import type { TalentBridgeSession } from './authTypes'

export const SESSION_STORAGE_KEY = 'talentbridge.session.v1'
const REFRESH_THRESHOLD_SECONDS = 60
const listeners = new Set<() => void>()

export type RefreshImplementation = (refreshToken: string) => Promise<TalentBridgeSession>

let refreshImplementation: RefreshImplementation = async () => {
  throw new Error('Session refresh is not configured')
}
let refreshInFlight: Promise<string> | null = null

function isSession(value: unknown): value is TalentBridgeSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  const user = session.user as Record<string, unknown> | undefined

  return typeof session.accessToken === 'string'
    && session.accessToken.length > 0
    && typeof session.refreshToken === 'string'
    && session.refreshToken.length > 0
    && typeof session.expiresAt === 'number'
    && Number.isFinite(session.expiresAt)
    && session.tokenType === 'bearer'
    && !!user
    && typeof user.id === 'string'
    && user.id.length > 0
    && (user.email === undefined || typeof user.email === 'string')
}

function emit() {
  listeners.forEach((listener) => listener())
}

export function readSession(): TalentBridgeSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isSession(parsed)) throw new Error('invalid session shape')
    return parsed
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    emit()
    return null
  }
}

export function writeSession(session: TalentBridgeSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  emit()
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  emit()
}

export function getCurrentUserId() {
  return readSession()?.user.id ?? null
}

export function getCurrentAccessToken() {
  return readSession()?.accessToken ?? null
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setRefreshImplementation(fn: RefreshImplementation) {
  refreshImplementation = fn
}

export async function getValidAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null

  const secondsRemaining = session.expiresAt - Math.floor(Date.now() / 1000)
  if (secondsRemaining > REFRESH_THRESHOLD_SECONDS) return session.accessToken
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = refreshImplementation(session.refreshToken)
    .then((next) => {
      writeSession(next)
      return next.accessToken
    })
    .catch((error) => {
      clearSession()
      throw error
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

setRefreshImplementation(refreshSession)
