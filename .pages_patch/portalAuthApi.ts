import { env } from '../../lib/env'
import type { SignupInput } from './authSchemas'
import type { TalentBridgeSession } from './authTypes'

const AUTH_TIMEOUT_MS = 8_000
const SUPABASE_ROOT = env.VITE_SUPABASE_URL.replace(/\/$/, '')
const PORTAL_AUTH_URL = `${SUPABASE_ROOT}/functions/v1/portal-auth`
const AUTH_TOKEN_URL = `${SUPABASE_ROOT}/auth/v1/token`
const API_KEY_QUERY = encodeURIComponent(env.VITE_SUPABASE_ANON_KEY)

type PortalAction =
  | 'logout'
  | 'signup'
  | 'request_password_reset'
  | 'update_recovered_password'

type PortalError = { error?: string }
type AuthError = {
  error?: string
  error_code?: string
  error_description?: string
  msg?: string
}

type AuthSessionPayload = AuthError & {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  token_type?: string
  user?: {
    id?: string
    email?: string
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Authentication request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function mapAuthSession(payload: AuthSessionPayload): TalentBridgeSession {
  if (
    typeof payload.access_token !== 'string'
    || typeof payload.refresh_token !== 'string'
    || typeof payload.user?.id !== 'string'
  ) {
    throw new Error('Authentication returned an incomplete session. Please try again.')
  }

  const expiresIn = Number(payload.expires_in ?? 3600)
  const expiresAt = Number(payload.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn)

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    tokenType: 'bearer',
    user: {
      id: payload.user.id,
      ...(typeof payload.user.email === 'string' ? { email: payload.user.email } : {}),
    },
  }
}

async function callAuthToken(
  grantType: 'password' | 'refresh_token',
  body: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<TalentBridgeSession> {
  // Keep this request CORS-simple. The API key is intentionally in the query
  // string and the body is JSON sent as text/plain, so the browser does not
  // need an OPTIONS preflight before contacting Supabase Auth.
  const url = `${AUTH_TOKEN_URL}?grant_type=${grantType}&apikey=${API_KEY_QUERY}`
  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    },
    fetchImpl,
  )

  const payload = await response.json().catch(() => ({})) as AuthSessionPayload
  if (!response.ok) {
    if (response.status === 400 || payload.error_code === 'invalid_credentials') {
      throw new Error('Invalid email or password')
    }
    throw new Error(
      payload.msg
      || payload.error_description
      || payload.error
      || `Authentication request failed (${response.status})`,
    )
  }

  return mapAuthSession(payload)
}

async function callPortalAuth<T>(
  body: Record<string, unknown> & { action: PortalAction },
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchWithTimeout(
    PORTAL_AUTH_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    },
    fetchImpl,
  )

  const payload = await response.json().catch(() => ({})) as PortalError & T
  if (!response.ok) {
    throw new Error(payload.error || `Authentication request failed (${response.status})`)
  }
  return payload
}

export function loginWithPassword(email: string, password: string, fetchImpl?: typeof fetch) {
  return callAuthToken(
    'password',
    { email: email.trim(), password },
    fetchImpl,
  )
}

export function refreshSession(refreshToken: string, fetchImpl?: typeof fetch) {
  return callAuthToken(
    'refresh_token',
    { refresh_token: refreshToken },
    fetchImpl,
  )
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
