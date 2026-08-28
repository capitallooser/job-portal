import { env } from '../../lib/env'
import type { SignupInput } from './authSchemas'
import type { TalentBridgeSession } from './authTypes'

const AUTH_TIMEOUT_MS = 8_000
const PORTAL_AUTH_URL = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/portal-auth`

type PortalAction =
  | 'login'
  | 'refresh'
  | 'logout'
  | 'signup'
  | 'request_password_reset'
  | 'update_recovered_password'

type PortalError = { error?: string }

async function callPortalAuth<T>(
  body: Record<string, unknown> & { action: PortalAction },
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  try {
    const response = await fetchImpl(PORTAL_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({})) as PortalError & T
    if (!response.ok) {
      throw new Error(payload.error || `Authentication request failed (${response.status})`)
    }
    return payload
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Authentication request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function loginWithPassword(email: string, password: string, fetchImpl?: typeof fetch) {
  return callPortalAuth<TalentBridgeSession>(
    { action: 'login', email: email.trim(), password },
    fetchImpl,
  )
}

export function refreshSession(refreshToken: string, fetchImpl?: typeof fetch) {
  return callPortalAuth<TalentBridgeSession>({ action: 'refresh', refreshToken }, fetchImpl)
}

export async function revokeSession(accessToken: string, fetchImpl?: typeof fetch) {
  await callPortalAuth<{ ok: true }>({ action: 'logout', accessToken }, fetchImpl)
}

export async function signupCandidateThroughPortal(input: SignupInput, fetchImpl?: typeof fetch) {
  await callPortalAuth<{ ok: true }>(
    {
      action: 'signup',
      fullName: input.fullName,
      mobile: input.mobile,
      email: input.email.trim(),
      password: input.password,
    },
    fetchImpl,
  )
}

export async function requestRecovery(email: string, fetchImpl?: typeof fetch) {
  await callPortalAuth<{ ok: true }>({ action: 'request_password_reset', email: email.trim() }, fetchImpl)
}

export async function updateRecoveredPassword(
  recoveryAccessToken: string,
  password: string,
  fetchImpl?: typeof fetch,
) {
  await callPortalAuth<{ ok: true }>(
    { action: 'update_recovered_password', recoveryAccessToken, password },
    fetchImpl,
  )
}
