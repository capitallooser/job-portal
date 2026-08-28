# TalentBridge Simple Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TalentBridge's browser-managed Supabase Auth flow with a TalentBridge-owned session manager and a Supabase Edge Function auth boundary while preserving existing Supabase Auth identities, JWT-backed RLS, roles, profiles, jobs, applications, approvals, notifications, and zero-cost hosting.

**Architecture:** GitHub Pages remains the static React/Vite host. A `portal-auth` Supabase Edge Function performs login/signup/refresh/logout/recovery calls to Supabase Auth server-to-server, while the browser stores one versioned TalentBridge session and supplies its access token to the Supabase data client via the supported async `accessToken` callback. Browser code no longer calls Supabase Auth session APIs.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, React Router 7 HashRouter, TanStack Query 5, `@supabase/supabase-js` 2.x, Supabase Auth/Postgres/RLS/Edge Functions, Vitest 3, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-08-28-simple-auth-architecture-design.md`

## Global Constraints

- Keep GitHub Pages as the frontend host and Supabase as the existing database/Auth/token issuer; add no paid service.
- Browser code must not call `supabase.auth.signInWithPassword()`, `supabase.auth.getSession()`, `supabase.auth.getUser()`, `supabase.auth.onAuthStateChange()`, or `supabase.auth.signOut()` after cutover.
- Browser code must contain only the public/publishable Supabase key; never expose or commit service-role, secret, database-password, access-token, refresh-token, recovery-token, or user passwords.
- Preserve existing Auth user UUIDs, `profiles`, `user_roles`, RLS policies, job/application data, approval state, and role priority `super_admin > admin > associate > candidate`.
- Keep candidate signup approval-gated; signup must not leave a candidate signed in.
- Login/logout/refresh requests must be bounded; no UI can remain in an infinite auth loading state.
- Session storage key is exactly `talentbridge.session.v1`.
- Access tokens refresh when less than 60 seconds remain; concurrent refreshes share one in-flight Promise; rotated refresh tokens replace old tokens atomically.
- Logout is local-first: clear TalentBridge session/profile immediately, then make bounded remote revocation best-effort.
- The production acceptance sequence must work in one normal Chrome profile without Incognito, hard refresh, password reset, or manual storage clearing: Candidate1 -> logout -> Akash -> logout -> Mayank -> logout -> original Super Admin.
- Continue the repository's current ZIP + `.pages_patch` deployment model for this cutover; do not normalize the repository structure as part of this feature.

## Execution Workspace Convention

The Git repository does **not** contain `src/` as ordinary tracked files; the deployable app is inside `job-portal-full-source.zip` and changed files are overlaid from `.pages_patch/`. At the start of execution, materialize an untracked working app directory and apply every patch already listed in the current deployment workflow:

```bash
rm -rf app
mkdir app
unzip -q job-portal-full-source.zip -d app
python - <<'PYWORK'
from pathlib import Path
import subprocess
for line in Path('.github/workflows/deploy-pages.yml').read_text().splitlines():
    command = line.strip()
    if command.startswith('cp .pages_patch/'):
        subprocess.run(command.split(), check=True)
PYWORK
cd app
npm install --no-audit --no-fund
```

All `src/...` paths in the tasks below mean `app/src/...` in that generated working directory. Run all `npm`/`npx` commands from `app/`. After any commit step returns to the repository root, start the next task with `cd app`. Before each commit, copy every changed/generated `app/src/...` file named in that task to its corresponding flat `.pages_patch/<basename>` file, because only `.pages_patch` and direct repository files are committed. Never commit the generated `app/` directory.

---

## File Structure for the Cutover

New focused browser modules:

- `src/features/auth/authTypes.ts` — session/auth-state types shared by the new auth modules.
- `src/features/auth/portalAuthApi.ts` — simple `text/plain` calls to the Edge Function; no browser Supabase Auth calls.
- `src/features/auth/sessionManager.ts` — localStorage session, expiry, single-flight refresh, session events.
- `src/features/auth/AuthProvider.tsx` — React auth state derived from session manager and database profile/roles.
- `src/features/auth/recoveryRedirect.ts` — extracts Supabase recovery fragment before HashRouter consumes it.
- `src/features/auth/authProfileApi.ts` — profile + effective role fetch using a known user UUID.

Existing browser modules modified:

- `src/lib/supabase.ts` — data client with async `accessToken` and browser Auth persistence disabled.
- `src/app/providers.tsx` — wraps app in `AuthProvider` inside `QueryClientProvider`.
- `src/features/auth/useSessionProfile.ts` — compatibility wrapper over `AuthProvider`; no Supabase Auth calls.
- `src/features/auth/LoginPage.tsx`, `SignupPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `PendingApprovalPage.tsx`, `ProtectedRoute.tsx`, `RoleRoute.tsx`, `authApi.ts` — use TalentBridge auth state/API.
- `src/components/layout/Topbar.tsx` — local-first logout.
- `src/features/jobs/jobsApi.ts`, `savedJobsApi.ts`, `applications/applicationsApi.ts`, `profile/profileApi.ts`, `admin/settingsApi.ts`, `notifications/notificationsApi.ts` — obtain actor UUID from `sessionManager`, not Supabase Auth.
- `src/main.tsx` — consume a recovery hash before router startup.

Backend/source-control files:

- `supabase/functions/portal-auth/index.ts` — source-of-truth Edge Function implementation.
- `.pages_patch/*` — deployment overlays for every changed browser file because the canonical app source is currently stored in `job-portal-full-source.zip`.
- `.github/workflows/deploy-pages.yml` — copies all new overlays, runs auth tests, and fails if forbidden browser Auth calls remain.

---

### Task 1: Versioned TalentBridge Session Manager

**Files:**
- Create: `src/features/auth/authTypes.ts`
- Create: `src/features/auth/sessionManager.ts`
- Test: `src/features/auth/sessionManager.test.ts`
- Mirror for deployment: `.pages_patch/authTypes.ts`, `.pages_patch/sessionManager.ts`, `.pages_patch/sessionManager.test.ts`

**Interfaces:**
- Consumes: `refreshSession(refreshToken: string): Promise<TalentBridgeSession>` from Task 2. During this task, inject refresh as a test dependency so Task 1 remains independently testable.
- Produces:
  - `TalentBridgeSession`
  - `SESSION_STORAGE_KEY`
  - `readSession(): TalentBridgeSession | null`
  - `writeSession(session: TalentBridgeSession): void`
  - `clearSession(): void`
  - `getCurrentUserId(): string | null`
  - `getCurrentAccessToken(): string | null`
  - `getValidAccessToken(): Promise<string | null>`
  - `subscribeSession(listener: () => void): () => void`
  - `setRefreshImplementation(fn: RefreshImplementation): void` only as an internal/test seam; Task 2 installs the real implementation once at module initialization.

- [ ] **Step 1: Write failing tests for storage, malformed data, and user lookup**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_STORAGE_KEY,
  clearSession,
  getCurrentUserId,
  readSession,
  writeSession,
} from './sessionManager'
import type { TalentBridgeSession } from './authTypes'

const session: TalentBridgeSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1_700_000_600,
  tokenType: 'bearer',
  user: { id: 'candidate-1', email: 'candidate1@neepanlok.com' },
}

beforeEach(() => localStorage.clear())

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
```

- [ ] **Step 2: Run the session tests and verify RED**

Run:

```bash
npm test -- --run src/features/auth/sessionManager.test.ts
```

Expected: FAIL because `sessionManager.ts` and `authTypes.ts` do not exist.

- [ ] **Step 3: Implement the exact session type and storage validation**

```ts
// authTypes.ts
import type { SessionProfile } from '../../types/domain'

export type TalentBridgeSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: 'bearer'
  user: { id: string; email?: string }
}

export type AuthStatus =
  | 'booting'
  | 'signed_out'
  | 'loading_profile'
  | 'approved_candidate'
  | 'approved_privileged'
  | 'pending_approval'
  | 'rejected'
  | 'blocked'
  | 'session_error'

export type AuthState = {
  status: AuthStatus
  profile: SessionProfile | null
  userId: string | null
  error: string | null
}
```

```ts
// sessionManager.ts storage portion
import type { TalentBridgeSession } from './authTypes'

export const SESSION_STORAGE_KEY = 'talentbridge.session.v1'
const listeners = new Set<() => void>()

function isSession(value: unknown): value is TalentBridgeSession {
  if (!value || typeof value !== 'object') return false
  const x = value as Record<string, unknown>
  const user = x.user as Record<string, unknown> | undefined
  return typeof x.accessToken === 'string'
    && typeof x.refreshToken === 'string'
    && typeof x.expiresAt === 'number'
    && x.tokenType === 'bearer'
    && !!user
    && typeof user.id === 'string'
    && (user.email === undefined || typeof user.email === 'string')
}

function emit() { listeners.forEach((listener) => listener()) }

export function readSession() {
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

export function getCurrentUserId() { return readSession()?.user.id ?? null }
export function getCurrentAccessToken() { return readSession()?.accessToken ?? null }
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
```

- [ ] **Step 4: Add failing tests for 60-second refresh threshold, rotation, and single-flight refresh**

```ts
import { getValidAccessToken, setRefreshImplementation } from './sessionManager'

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
  const refresh = vi.fn(() => new Promise<TalentBridgeSession>((resolve) => { resolveRefresh = resolve }))
  setRefreshImplementation(refresh)
  const a = getValidAccessToken()
  const b = getValidAccessToken()
  expect(refresh).toHaveBeenCalledTimes(1)
  resolveRefresh({ ...session, accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: 1_700_003_600 })
  await expect(Promise.all([a, b])).resolves.toEqual(['access-2', 'access-2'])
  expect(readSession()?.refreshToken).toBe('refresh-2')
})

it('clears the session when refresh definitively fails', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  writeSession({ ...session, expiresAt: 1_700_000_030 })
  setRefreshImplementation(async () => { throw new Error('refresh token expired') })
  await expect(getValidAccessToken()).rejects.toThrow('refresh token expired')
  expect(readSession()).toBeNull()
})
```

- [ ] **Step 5: Implement single-flight refresh**

```ts
export type RefreshImplementation = (refreshToken: string) => Promise<TalentBridgeSession>
let refreshImplementation: RefreshImplementation = async () => {
  throw new Error('Session refresh is not configured')
}
let refreshInFlight: Promise<string> | null = null

export function setRefreshImplementation(fn: RefreshImplementation) {
  refreshImplementation = fn
}

export async function getValidAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session) return null
  if (session.expiresAt - Math.floor(Date.now() / 1000) > 60) return session.accessToken
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
    .finally(() => { refreshInFlight = null })

  return refreshInFlight
}
```

- [ ] **Step 6: Run Task 1 tests and verify GREEN**

```bash
npm test -- --run src/features/auth/sessionManager.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
cp src/features/auth/authTypes.ts ../.pages_patch/authTypes.ts
cp src/features/auth/sessionManager.ts ../.pages_patch/sessionManager.ts
cp src/features/auth/sessionManager.test.ts ../.pages_patch/sessionManager.test.ts
cd ..
git add .pages_patch/authTypes.ts .pages_patch/sessionManager.ts .pages_patch/sessionManager.test.ts
git commit -m "feat(auth): add TalentBridge session manager"
```

---

### Task 2: `portal-auth` Edge Function and Browser Transport

**Files:**
- Create: `supabase/functions/portal-auth/index.ts`
- Create: `src/features/auth/portalAuthApi.ts`
- Test: `src/features/auth/portalAuthApi.test.ts`
- Modify: `src/features/auth/sessionManager.ts`
- Mirror browser files: `.pages_patch/portalAuthApi.ts`, `.pages_patch/portalAuthApi.test.ts`, `.pages_patch/sessionManager.ts`

**Interfaces:**
- Consumes: `TalentBridgeSession`, `setRefreshImplementation()` from Task 1.
- Produces:
  - `loginWithPassword(email, password): Promise<TalentBridgeSession>`
  - `refreshSession(refreshToken): Promise<TalentBridgeSession>`
  - `revokeSession(accessToken): Promise<void>`
  - `signupCandidateThroughPortal(input): Promise<void>`
  - `requestRecovery(email): Promise<void>`
  - `updateRecoveredPassword(recoveryAccessToken, password): Promise<void>`
  - Edge Function actions: `login | refresh | logout | signup | request_password_reset | update_recovered_password`.

- [ ] **Step 1: Write failing browser-transport tests that forbid the old direct Auth path**

```ts
import { describe, expect, it, vi } from 'vitest'
import { loginWithPassword } from './portalAuthApi'

it('sends a CORS-simple text/plain request to portal-auth', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    accessToken: 'a', refreshToken: 'r', expiresAt: 1_700_003_600,
    tokenType: 'bearer', user: { id: 'u1', email: 'candidate1@neepanlok.com' },
  }), { status: 200 }))

  await loginWithPassword('candidate1@neepanlok.com', 'Password123!', fetchImpl as typeof fetch)

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('https://vizfrptpkdofnvykbtbh.supabase.co/functions/v1/portal-auth')
  expect(init.method).toBe('POST')
  expect(init.headers).toEqual({ 'Content-Type': 'text/plain' })
  expect(String(url)).not.toContain('/auth/v1/token')
  expect(JSON.parse(String(init.body))).toMatchObject({ action: 'login', email: 'candidate1@neepanlok.com' })
})
```

- [ ] **Step 2: Run the transport test and verify RED**

```bash
npm test -- --run src/features/auth/portalAuthApi.test.ts
```

Expected: FAIL because `portalAuthApi.ts` does not exist.

- [ ] **Step 3: Implement the browser transport with a bounded request**

```ts
import { env } from '../../lib/env'
import type { SignupInput } from './authSchemas'
import type { TalentBridgeSession } from './authTypes'

const AUTH_TIMEOUT_MS = 8_000
const PORTAL_AUTH_URL = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/portal-auth`

type PortalAction = 'login' | 'refresh' | 'logout' | 'signup' | 'request_password_reset' | 'update_recovered_password'

async function callPortalAuth<T>(body: Record<string, unknown> & { action: PortalAction }, fetchImpl: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(PORTAL_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({})) as { error?: string } & T
    if (!response.ok) throw new Error(payload.error || `Authentication request failed (${response.status})`)
    return payload
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Authentication request timed out. Please try again.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const loginWithPassword = (email: string, password: string, fetchImpl?: typeof fetch) =>
  callPortalAuth<TalentBridgeSession>({ action: 'login', email: email.trim(), password }, fetchImpl)
export const refreshSession = (refreshToken: string) =>
  callPortalAuth<TalentBridgeSession>({ action: 'refresh', refreshToken })
export const revokeSession = (accessToken: string) =>
  callPortalAuth<void>({ action: 'logout', accessToken })
export const signupCandidateThroughPortal = (input: SignupInput) =>
  callPortalAuth<void>({ action: 'signup', fullName: input.fullName, mobile: input.mobile, email: input.email.trim(), password: input.password })
export const requestRecovery = (email: string) =>
  callPortalAuth<void>({ action: 'request_password_reset', email: email.trim() })
export const updateRecoveredPassword = (recoveryAccessToken: string, password: string) =>
  callPortalAuth<void>({ action: 'update_recovered_password', recoveryAccessToken, password })
```

- [ ] **Step 4: Write the Edge Function source with explicit action validation and no secrets in responses**

The implementation must use only reserved server-side Supabase environment values, with the legacy anonymous key kept server-side as the API gateway credential. It must not use the service-role key for password validation.

```ts
// supabase/functions/portal-auth/index.ts
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const PROD_ORIGIN = 'https://capitallooser.github.io'
const RESET_REDIRECT = 'https://capitallooser.github.io/job-portal/?talentbridge_recovery=1'

function cors(origin: string | null) {
  const allowed = origin === PROD_ORIGIN || origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173'
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : PROD_ORIGIN,
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  }
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

async function authFetch(path: string, init: RequestInit) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

function toSession(payload: any) {
  if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) throw new Error('Incomplete Auth session')
  const expiresIn = Number(payload.expires_in ?? 3600)
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Number(payload.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn),
    tokenType: 'bearer',
    user: { id: payload.user.id, ...(payload.user.email ? { email: payload.user.email } : {}) },
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405)

  let body: any
  try { body = JSON.parse(await req.text()) } catch { return json(origin, { error: 'Invalid request body' }, 400) }

  try {
    switch (body.action) {
      case 'login': {
        if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length < 8) return json(origin, { error: 'Invalid email or password' }, 400)
        const res = await authFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: body.email.trim(), password: body.password }) })
        const payload = await res.json()
        if (!res.ok) return json(origin, { error: res.status === 400 ? 'Invalid email or password' : 'Unable to sign in' }, res.status)
        return json(origin, toSession(payload))
      }
      case 'refresh': {
        if (typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) return json(origin, { error: 'Invalid refresh token' }, 400)
        const res = await authFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: body.refreshToken }) })
        const payload = await res.json()
        if (!res.ok) return json(origin, { error: 'Session expired. Please sign in again.' }, 401)
        return json(origin, toSession(payload))
      }
      case 'logout': {
        if (typeof body.accessToken !== 'string' || body.accessToken.length < 20) return json(origin, { ok: true })
        await authFetch('/auth/v1/logout?scope=global', { method: 'POST', headers: { Authorization: `Bearer ${body.accessToken}` } })
        return json(origin, { ok: true })
      }
      case 'signup': {
        if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length < 8 || typeof body.fullName !== 'string' || body.fullName.trim().length < 2) return json(origin, { error: 'Please complete all required signup fields' }, 400)
        const res = await authFetch('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: body.email.trim(), password: body.password, data: { full_name: body.fullName.trim(), mobile: typeof body.mobile === 'string' ? body.mobile.trim() : null } }) })
        const payload = await res.json()
        if (!res.ok) return json(origin, { error: payload?.msg || 'Unable to create account' }, res.status)
        return json(origin, { ok: true }, 201)
      }
      case 'request_password_reset': {
        if (typeof body.email !== 'string') return json(origin, { ok: true })
        await authFetch(`/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, { method: 'POST', body: JSON.stringify({ email: body.email.trim() }) })
        return json(origin, { ok: true })
      }
      case 'update_recovered_password': {
        if (typeof body.recoveryAccessToken !== 'string' || typeof body.password !== 'string' || body.password.length < 8) return json(origin, { error: 'Invalid recovery request' }, 400)
        const res = await authFetch('/auth/v1/user', { method: 'PUT', headers: { Authorization: `Bearer ${body.recoveryAccessToken}` }, body: JSON.stringify({ password: body.password }) })
        if (!res.ok) return json(origin, { error: 'Recovery link is invalid or expired' }, 401)
        return json(origin, { ok: true })
      }
      default:
        return json(origin, { error: 'Unsupported authentication action' }, 400)
    }
  } catch {
    return json(origin, { error: 'Authentication service unavailable. Please try again.' }, 503)
  }
})
```

- [ ] **Step 5: Install the real refresh implementation in `sessionManager.ts`**

```ts
import { refreshSession } from './portalAuthApi'
// after `setRefreshImplementation` definition:
setRefreshImplementation(refreshSession)
```

- [ ] **Step 6: Run browser auth transport/session tests and typecheck**

```bash
npm test -- --run src/features/auth/sessionManager.test.ts src/features/auth/portalAuthApi.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Deploy `portal-auth` and smoke-test only non-secret error behavior**

Deploy `supabase/functions/portal-auth/index.ts` to project `vizfrptpkdofnvykbtbh` with `verify_jwt=false`, then call the function with `text/plain` body `{"action":"unsupported"}`.

Expected HTTP status: `400`.
Expected JSON: `{"error":"Unsupported authentication action"}`.

Do not put any real password or token into GitHub Actions logs.

- [ ] **Step 8: Commit Task 2**

```bash
cp src/features/auth/portalAuthApi.ts ../.pages_patch/portalAuthApi.ts
cp src/features/auth/portalAuthApi.test.ts ../.pages_patch/portalAuthApi.test.ts
cp src/features/auth/sessionManager.ts ../.pages_patch/sessionManager.ts
cd ..
git add supabase/functions/portal-auth/index.ts .pages_patch/portalAuthApi.ts .pages_patch/portalAuthApi.test.ts .pages_patch/sessionManager.ts
git commit -m "feat(auth): add portal auth boundary"
```

---

### Task 3: Authenticated Supabase Data Client Without Browser Auth State

**Files:**
- Modify: `src/lib/supabase.ts`
- Create: `src/lib/supabase.test.ts`
- Mirror: `.pages_patch/supabase.ts`, `.pages_patch/supabase.test.ts`

**Interfaces:**
- Consumes: `getValidAccessToken(): Promise<string | null>` from Task 1.
- Produces: existing exported `supabase` data client, now configured with TalentBridge access tokens and browser Auth state disabled.

- [ ] **Step 1: Write a failing source-level configuration test**

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

it('uses the TalentBridge accessToken callback and disables Supabase browser session management', () => {
  const source = fs.readFileSync(new URL('./supabase.ts', import.meta.url), 'utf8')
  expect(source).toContain('accessToken: getValidAccessToken')
  expect(source).toContain('persistSession: false')
  expect(source).toContain('autoRefreshToken: false')
  expect(source).toContain('detectSessionInUrl: false')
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test -- --run src/lib/supabase.test.ts
```

Expected: FAIL because current client has persistence enabled and no `accessToken` callback.

- [ ] **Step 3: Replace the client configuration**

```ts
import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import { getValidAccessToken } from '../features/auth/sessionManager'

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  accessToken: getValidAccessToken,
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 4: Run test and typecheck**

```bash
npm test -- --run src/lib/supabase.test.ts
npm run typecheck
```

Expected: PASS. The ZIP manifest already declares `@supabase/supabase-js` as `^2.56.1`, so `npm install` resolves a current compatible 2.x release. If the installed 2.x type definition unexpectedly lacks root-level `accessToken`, stop and verify the installed version against current Supabase documentation before changing dependencies; do not invent an alternate Authorization-header hack inside this task.

- [ ] **Step 5: Commit Task 3**

```bash
cp src/lib/supabase.ts ../.pages_patch/supabase.ts
cp src/lib/supabase.test.ts ../.pages_patch/supabase.test.ts
cd ..
git add .pages_patch/supabase.ts .pages_patch/supabase.test.ts
git commit -m "refactor(auth): use TalentBridge token callback"
```

---

### Task 4: Database Profile Resolver and React Auth Provider

**Files:**
- Create: `src/features/auth/authProfileApi.ts`
- Create: `src/features/auth/AuthProvider.tsx`
- Test: `src/features/auth/authProfileApi.test.ts`
- Test: `src/features/auth/AuthProvider.test.tsx`
- Modify: `src/app/providers.tsx`
- Modify: `src/features/auth/useSessionProfile.ts`
- Modify: `src/features/auth/ProtectedRoute.tsx`
- Modify: `src/features/auth/RoleRoute.tsx`
- Mirror all changed/new files under `.pages_patch/` and add copy entries later in Task 9.

**Interfaces:**
- Consumes: `readSession()`, `subscribeSession()`, `getCurrentUserId()`, `clearSession()` from Task 1 and existing `supabase` data client from Task 3.
- Produces:
  - `resolveEffectiveRole(roles: AppRole[]): AppRole`
  - `fetchSessionProfileByUserId(userId: string): Promise<SessionProfile>`
  - `AuthProvider`
  - `useAuth(): AuthContextValue`
  - compatibility `useSessionProfile(): { data: SessionProfile | null; isLoading: boolean; error: Error | null }`
  - `reloadProfile(): Promise<SessionProfile | null>`.

- [ ] **Step 1: Write role-priority and profile-fetch tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveEffectiveRole } from './authProfileApi'

it('selects the highest privilege role without deleting candidate', () => {
  expect(resolveEffectiveRole(['candidate', 'admin'])).toBe('admin')
  expect(resolveEffectiveRole(['candidate', 'super_admin'])).toBe('super_admin')
  expect(resolveEffectiveRole(['candidate'])).toBe('candidate')
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/features/auth/authProfileApi.test.ts
```

- [ ] **Step 3: Implement role/profile resolver using a known UUID**

```ts
import { supabase } from '../../lib/supabase'
import type { AppRole, SessionProfile } from '../../types/domain'

const ROLE_PRIORITY: AppRole[] = ['super_admin', 'admin', 'associate', 'candidate']

export function resolveEffectiveRole(roles: AppRole[]): AppRole {
  const assigned = new Set(roles)
  return ROLE_PRIORITY.find((role) => assigned.has(role)) ?? 'candidate'
}

export async function fetchSessionProfileByUserId(userId: string): Promise<SessionProfile> {
  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])
  if (profileError) throw profileError
  if (roleError) throw roleError
  return { ...profile, role: resolveEffectiveRole((roles ?? []).map((row) => row.role as AppRole)) } as SessionProfile
}
```

- [ ] **Step 4: Write provider-state tests for signed out, approved candidate, privileged user, pending, rejected, and blocked**

Test helper expectation:

```ts
expect(classifyProfile({ ...approvedCandidate, role: 'candidate' })).toBe('approved_candidate')
expect(classifyProfile({ ...approvedCandidate, role: 'admin' })).toBe('approved_privileged')
expect(classifyProfile({ ...approvedCandidate, approval_status: 'pending_approval' })).toBe('pending_approval')
expect(classifyProfile({ ...approvedCandidate, approval_status: 'rejected' })).toBe('rejected')
expect(classifyProfile({ ...approvedCandidate, is_blocked: true })).toBe('blocked')
```

- [ ] **Step 5: Implement `AuthProvider` with explicit states and session subscription**

```ts
export function classifyProfile(profile: SessionProfile): AuthStatus {
  if (profile.is_blocked) return 'blocked'
  if (profile.approval_status === 'pending_approval') return 'pending_approval'
  if (profile.approval_status === 'rejected') return 'rejected'
  return profile.role === 'candidate' ? 'approved_candidate' : 'approved_privileged'
}
```

Provider behavior:

```ts
const reloadProfile = useCallback(async () => {
  const userId = getCurrentUserId()
  if (!userId) {
    setState({ status: 'signed_out', profile: null, userId: null, error: null })
    return null
  }
  setState((current) => ({ ...current, status: 'loading_profile', userId, error: null }))
  try {
    const profile = await fetchSessionProfileByUserId(userId)
    setState({ status: classifyProfile(profile), profile, userId, error: null })
    return profile
  } catch (error) {
    setState({ status: 'session_error', profile: null, userId, error: error instanceof Error ? error.message : 'Unable to load account' })
    throw error
  }
}, [])
```

On mount, call `reloadProfile()`. Subscribe to session changes so clearing/writing a session recalculates state. Do not use `onAuthStateChange`.

- [ ] **Step 6: Update providers and compatibility hook**

```tsx
// app/providers.tsx
export function AppProviders({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
}
```

```ts
// useSessionProfile.ts
export function useSessionProfile() {
  const auth = useAuth()
  return {
    data: auth.profile,
    isLoading: auth.status === 'booting' || auth.status === 'loading_profile',
    error: auth.error ? new Error(auth.error) : null,
  }
}
```

- [ ] **Step 7: Rewrite route guards to consume explicit auth state**

`ProtectedRoute` and `RoleRoute` must route `signed_out -> /login`, `pending_approval|rejected|blocked -> /pending-approval`, and only use `profile.role` after approved state. Preserve existing candidate/admin route behavior.

- [ ] **Step 8: Run focused tests and typecheck**

```bash
npm test -- --run src/features/auth/authProfileApi.test.ts src/features/auth/AuthProvider.test.tsx src/features/auth/RoleRoute.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
cp src/features/auth/authProfileApi.ts ../.pages_patch/authProfileApi.ts
cp src/features/auth/authProfileApi.test.ts ../.pages_patch/authProfileApi.test.ts
cp src/features/auth/AuthProvider.tsx ../.pages_patch/AuthProvider.tsx
cp src/features/auth/AuthProvider.test.tsx ../.pages_patch/AuthProvider.test.tsx
cp src/features/auth/useSessionProfile.ts ../.pages_patch/useSessionProfile.ts
cp src/features/auth/ProtectedRoute.tsx ../.pages_patch/ProtectedRoute.tsx
cp src/features/auth/RoleRoute.tsx ../.pages_patch/RoleRoute.tsx
cp src/app/providers.tsx ../.pages_patch/providers.tsx
cd ..
git add .pages_patch/authProfileApi.ts .pages_patch/authProfileApi.test.ts .pages_patch/AuthProvider.tsx .pages_patch/AuthProvider.test.tsx .pages_patch/useSessionProfile.ts .pages_patch/ProtectedRoute.tsx .pages_patch/RoleRoute.tsx .pages_patch/providers.tsx
git commit -m "feat(auth): add explicit auth provider state"
```

---

### Task 5: Reliable Login and Local-First Logout

**Files:**
- Modify: `src/features/auth/authApi.ts`
- Modify: `src/features/auth/LoginPage.tsx`
- Modify: `src/components/layout/Topbar.tsx`
- Modify: `src/features/auth/PendingApprovalPage.tsx`
- Test: `src/features/auth/authApi.test.ts`
- Test: `src/features/auth/LoginPage.test.tsx`
- Mirror changed files under `.pages_patch/`.

**Interfaces:**
- Consumes: `loginWithPassword`, `revokeSession`; `writeSession`, `clearSession`, `getCurrentAccessToken`; `useAuth().reloadProfile()`; `queryClient`.
- Produces: stable `signIn(input)`, local-first `signOut()`, deterministic role redirect.

- [ ] **Step 1: Write failing tests proving login stores the new session and logout clears before network revocation**

```ts
it('writes the returned session after successful password login', async () => {
  vi.mocked(loginWithPassword).mockResolvedValue(session)
  await signIn({ email: 'candidate1@neepanlok.com', password: 'Password123!' })
  expect(writeSession).toHaveBeenCalledWith(session)
})

it('clears locally before waiting for remote revoke', async () => {
  vi.mocked(getCurrentAccessToken).mockReturnValue('access-1')
  let resolve!: () => void
  vi.mocked(revokeSession).mockReturnValue(new Promise<void>((r) => { resolve = r }))
  const result = signOut()
  expect(clearSession).toHaveBeenCalled()
  expect(queryClient.clear).toHaveBeenCalled()
  resolve()
  await result
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/features/auth/authApi.test.ts
```

- [ ] **Step 3: Replace login/logout implementation**

```ts
export async function signIn(input: LoginInput) {
  clearSession()
  queryClient.clear()
  const session = await loginWithPassword(input.email, input.password)
  writeSession(session)
  return session
}

export async function signOut() {
  const accessToken = getCurrentAccessToken()
  clearSession()
  queryClient.clear()
  if (accessToken) {
    try { await revokeSession(accessToken) } catch { /* local logout already succeeded */ }
  }
}
```

- [ ] **Step 4: Rewrite `LoginPage` to reload profile after session write and never spin indefinitely**

Core submit logic:

```ts
const auth = useAuth()
const navigate = useNavigate()

await signIn(values)
const profile = await auth.reloadProfile()
if (!profile) throw new Error('Account profile could not be loaded')
if (profile.is_blocked || profile.approval_status !== 'approved') navigate('/pending-approval', { replace: true })
else navigate(profile.role === 'candidate' ? '/jobs' : '/admin', { replace: true })
```

`signIn()` already has an 8-second portal timeout. Ensure the catch branch always displays the error and React Hook Form returns `isSubmitting` to false.

- [ ] **Step 5: Add LoginPage tests for candidate/admin routing and visible errors**

Test candidate -> `/jobs`, admin -> `/admin`, invalid credential error -> button returns to `Sign in`.

- [ ] **Step 6: Update Topbar and PendingApproval logout to local-first flow**

Both call `await signOut()` and then set `location.hash = '#/login'` or use router navigation; no Supabase browser Auth API.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
npm test -- --run src/features/auth/authApi.test.ts src/features/auth/LoginPage.test.tsx src/features/auth/RoleRoute.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
cp src/features/auth/authApi.ts ../.pages_patch/authApi.ts
cp src/features/auth/authApi.test.ts ../.pages_patch/authApi.test.ts
cp src/features/auth/LoginPage.tsx ../.pages_patch/LoginPage.tsx
cp src/features/auth/LoginPage.test.tsx ../.pages_patch/LoginPage.test.tsx
cp src/features/auth/PendingApprovalPage.tsx ../.pages_patch/PendingApprovalPage.tsx
cp src/components/layout/Topbar.tsx ../.pages_patch/Topbar.tsx
cd ..
git add .pages_patch/authApi.ts .pages_patch/authApi.test.ts .pages_patch/LoginPage.tsx .pages_patch/LoginPage.test.tsx .pages_patch/PendingApprovalPage.tsx .pages_patch/Topbar.tsx
git commit -m "fix(auth): make login and logout deterministic"
```

---

### Task 6: Remove `supabase.auth.getUser()` From Application Features

**Files:**
- Modify: `src/features/jobs/jobsApi.ts`
- Modify: `src/features/jobs/savedJobsApi.ts`
- Modify: `src/features/applications/applicationsApi.ts`
- Modify: `src/features/profile/profileApi.ts`
- Modify: `src/features/admin/settingsApi.ts`
- Modify: `src/features/notifications/notificationsApi.ts`
- Test: add focused unit tests beside each API where practical; at minimum create `src/features/auth/noBrowserAuth.test.ts`.
- Mirror modified files under `.pages_patch/`.

**Interfaces:**
- Consumes: `getCurrentUserId(): string | null` from Task 1.
- Produces: same public API functions as today; no caller signature changes.

- [ ] **Step 1: Write a failing source scan test covering the entire application source**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

it('contains no forbidden browser Supabase Auth session calls', () => {
  const root = path.resolve('src')
  const forbidden = ['supabase.auth.getUser(', 'supabase.auth.getSession(', 'supabase.auth.signInWithPassword(', 'supabase.auth.onAuthStateChange(', 'supabase.auth.signOut(']
  const violations = files(root).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8')
    return forbidden.filter((needle) => source.includes(needle)).map((needle) => `${file}: ${needle}`)
  })
  expect(violations).toEqual([])
})
```

- [ ] **Step 2: Run and verify RED with exact current violations**

```bash
npm test -- --run src/features/auth/noBrowserAuth.test.ts
```

Expected: FAIL listing current `getUser`/session references.

- [ ] **Step 3: Replace user discovery in every feature with the TalentBridge UUID**

Use this pattern consistently:

```ts
import { getCurrentUserId } from '../auth/sessionManager' // adjust relative path per file

function requireUserId() {
  const userId = getCurrentUserId()
  if (!userId) throw new Error('Sign in required')
  return userId
}
```

Concrete changes:

- `jobsApi.createDraft`: `owner_id: requireUserId()`.
- `savedJobsApi.saveJob/unsaveJob/listSavedJobs`: use current UUID as `candidate_id`; `unsave/list` may return early when no ID exactly as current behavior does.
- `applicationsApi.listMyApplications`: filter `candidate_id` with current UUID; return `[]` signed out.
- `profileApi.updateProfile`: `.eq('id', currentUserId)`.
- `settingsApi.saveSetting`: `updated_by: currentUserId`; require signed-in actor rather than silently writing `null`.
- `notificationsApi.markAllRead`: filter `user_id` with current UUID; return early signed out.

Do not replace database authorization with frontend checks; all queries still go through the JWT-backed Supabase client and existing RLS.

- [ ] **Step 4: Run the no-browser-auth test and the affected existing feature tests**

```bash
npm test -- --run src/features/auth/noBrowserAuth.test.ts src/features/jobs/JobFeedPage.test.tsx src/features/applications/MyApplicationsPage.test.tsx src/features/notifications/NotificationsPage.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
cp src/features/jobs/jobsApi.ts ../.pages_patch/jobsApi.ts
cp src/features/jobs/savedJobsApi.ts ../.pages_patch/savedJobsApi.ts
cp src/features/applications/applicationsApi.ts ../.pages_patch/applicationsApi.ts
cp src/features/profile/profileApi.ts ../.pages_patch/profileApi.ts
cp src/features/admin/settingsApi.ts ../.pages_patch/settingsApi.ts
cp src/features/notifications/notificationsApi.ts ../.pages_patch/notificationsApi.ts
cp src/features/auth/noBrowserAuth.test.ts ../.pages_patch/noBrowserAuth.test.ts
cd ..
git add .pages_patch/jobsApi.ts .pages_patch/savedJobsApi.ts .pages_patch/applicationsApi.ts .pages_patch/profileApi.ts .pages_patch/settingsApi.ts .pages_patch/notificationsApi.ts .pages_patch/noBrowserAuth.test.ts
git commit -m "refactor(auth): remove browser auth user lookups"
```

---

### Task 7: Signup and Password Recovery Through `portal-auth`

**Files:**
- Modify: `src/features/auth/authApi.ts`
- Modify: `src/features/auth/SignupPage.tsx`
- Modify: `src/features/auth/ForgotPasswordPage.tsx`
- Modify: `src/features/auth/ResetPasswordPage.tsx`
- Create: `src/features/auth/recoveryRedirect.ts`
- Test: `src/features/auth/recoveryRedirect.test.ts`
- Modify: `src/main.tsx`
- Mirror changed/new files under `.pages_patch/`.

**Interfaces:**
- Consumes: `signupCandidateThroughPortal`, `requestRecovery`, `updateRecoveredPassword` from Task 2.
- Produces:
  - `consumeRecoveryFragment(locationLike): string | null`
  - `RECOVERY_STORAGE_KEY = 'talentbridge.recovery.v1'`
  - signup/reset APIs with existing UI semantics.

- [ ] **Step 1: Write recovery-fragment tests that work with HashRouter**

```ts
it('extracts a Supabase recovery access token and converts the hash to the reset route', () => {
  const fake = {
    hash: '#access_token=recovery-jwt&expires_in=3600&type=recovery',
    pathname: '/job-portal/',
    search: '?talentbridge_recovery=1',
    replace: vi.fn(),
  }
  expect(consumeRecoveryFragment(fake)).toBe('recovery-jwt')
  expect(fake.replace).toHaveBeenCalledWith('/job-portal/#/reset-password')
})

it('ignores ordinary HashRouter routes', () => {
  expect(consumeRecoveryFragment({ hash: '#/login', pathname: '/job-portal/', search: '', replace: vi.fn() })).toBeNull()
})
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run src/features/auth/recoveryRedirect.test.ts
```

- [ ] **Step 3: Implement recovery capture before React router startup**

```ts
export const RECOVERY_STORAGE_KEY = 'talentbridge.recovery.v1'

export function consumeRecoveryFragment(locationLike = window.location) {
  if (!locationLike.hash.startsWith('#access_token=')) return null
  const params = new URLSearchParams(locationLike.hash.slice(1))
  if (params.get('type') !== 'recovery') return null
  const token = params.get('access_token')
  if (!token) return null
  sessionStorage.setItem(RECOVERY_STORAGE_KEY, token)
  locationLike.replace(`${locationLike.pathname}#/reset-password`)
  return token
}
```

At the first executable line in `main.tsx`, call `consumeRecoveryFragment()` before rendering the app. If it causes `location.replace`, return without mounting the router for that navigation cycle.

- [ ] **Step 4: Replace signup/recovery methods in `authApi.ts`**

```ts
export async function signUpCandidate(input: SignupInput) {
  clearSession()
  queryClient.clear()
  await signupCandidateThroughPortal(input)
  return { user: null, session: null }
}

export async function requestPasswordReset(email: string) {
  await requestRecovery(email)
}

export async function updatePassword(password: string) {
  const token = sessionStorage.getItem(RECOVERY_STORAGE_KEY)
  if (!token) throw new Error('Recovery link is invalid or expired')
  await updateRecoveredPassword(token, password)
  sessionStorage.removeItem(RECOVERY_STORAGE_KEY)
}
```

- [ ] **Step 5: Keep signup approval semantics and neutral recovery copy**

`SignupPage` success copy remains exactly: `Account created — waiting for admin approval.` and must not navigate into protected routes.

`ForgotPasswordPage` displays the same neutral success text for any syntactically valid email: `If an account exists for this email, a reset link has been sent.`

`ResetPasswordPage` clears recovery state on success and links/navigates back to `/login`.

- [ ] **Step 6: Run auth/recovery tests and typecheck**

```bash
npm test -- --run src/features/auth/authApi.test.ts src/features/auth/recoveryRedirect.test.ts src/features/auth/authSchemas.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
cp src/features/auth/authApi.ts ../.pages_patch/authApi.ts
cp src/features/auth/authApi.test.ts ../.pages_patch/authApi.test.ts
cp src/features/auth/SignupPage.tsx ../.pages_patch/SignupPage.tsx
cp src/features/auth/ForgotPasswordPage.tsx ../.pages_patch/ForgotPasswordPage.tsx
cp src/features/auth/ResetPasswordPage.tsx ../.pages_patch/ResetPasswordPage.tsx
cp src/features/auth/recoveryRedirect.ts ../.pages_patch/recoveryRedirect.ts
cp src/features/auth/recoveryRedirect.test.ts ../.pages_patch/recoveryRedirect.test.ts
cp src/main.tsx ../.pages_patch/main.tsx
cd ..
git add .pages_patch/authApi.ts .pages_patch/authApi.test.ts .pages_patch/SignupPage.tsx .pages_patch/ForgotPasswordPage.tsx .pages_patch/ResetPasswordPage.tsx .pages_patch/recoveryRedirect.ts .pages_patch/recoveryRedirect.test.ts .pages_patch/main.tsx
git commit -m "feat(auth): move signup and recovery behind portal auth"
```

---

### Task 8: RLS/Role Integration Verification With Real Supabase JWTs

**Files:**
- Test/verification only; no planned database migration.
- If a concrete RLS failure is discovered, stop this task, document the exact failing policy/query, and create the smallest separate migration rather than weakening RLS broadly.

**Interfaces:**
- Consumes: deployed `portal-auth`, new frontend session/data client, existing database.
- Produces: evidence that `auth.uid()` and existing role-based policies still work with the access-token callback.

- [ ] **Step 1: Verify account state in the database without changing credentials**

Query `profiles` + `user_roles` for the four acceptance accounts and confirm:

- Candidate1 is approved, unblocked, effective candidate.
- Akash is approved, unblocked, has admin + candidate.
- Mayank is approved, unblocked, has super_admin + candidate.
- Original Super Admin is approved, unblocked, has super_admin + candidate.

Never fetch or log passwords/tokens.

- [ ] **Step 2: Browser integration test Candidate1 RLS**

After Candidate1 signs in through the new frontend, verify:

- `/jobs` loads published jobs.
- saved jobs and `listMyApplications()` use Candidate1's own UUID.
- Candidate1 cannot access `/admin`; route guard redirects to `/jobs`.
- an admin-only database action still fails under Candidate1's JWT if invoked directly from the UI path.

Expected: candidate-only permissions remain enforced by RLS/RPC functions.

- [ ] **Step 3: Browser integration test Admin RLS**

After Akash signs in:

- `/admin` loads.
- candidate approvals/jobs/applications available according to existing policies.
- Super-Admin-only `/admin/team` and `/admin/settings` remain inaccessible to Admin.

- [ ] **Step 4: Browser integration test Super Admin RLS**

After Mayank and then original Super Admin sign in:

- `/admin` loads.
- `/admin/team` and `/admin/settings` load.
- role resolver chooses `super_admin` despite retained candidate role.

- [ ] **Step 5: Verify refresh preserves identity**

Temporarily set a test session's `expiresAt` to within 30 seconds in browser dev/test harness, trigger two concurrent data queries, and verify:

- only one `portal-auth` refresh request occurs;
- both queries succeed;
- `readSession().user.id` is unchanged;
- rotated refresh token is stored;
- profile/RLS permissions are unchanged.

- [ ] **Step 6: Record verification evidence without changing production code**

This task is verification-only. Capture the observed route/RLS outcomes in the implementation session notes and make **no commit** unless an actual defect is found. If an RLS defect is found, stop and create a separately reviewed migration task rather than changing policy inside this verification task.

---

### Task 9: GitHub Pages Overlay, CI Gates, Full Acceptance, and Old Workaround Decommission

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`
- Add/modify all `.pages_patch/*` files created in Tasks 1-7.
- Modify: `.pages_patch/tsconfig.json` only if required for Node test imports.
- Backend decommission: redeploy existing `password-login` Edge Function as a `410 Gone` compatibility tombstone after acceptance passes.

**Interfaces:**
- Consumes: every browser module/test from Tasks 1-7 and deployed `portal-auth`.
- Produces: a green GitHub Pages build containing the new auth architecture and no active old login path.

- [ ] **Step 1: Add every new auth overlay to the extract step**

The workflow must copy, at minimum:

```bash
cp .pages_patch/authTypes.ts app/src/features/auth/authTypes.ts
cp .pages_patch/portalAuthApi.ts app/src/features/auth/portalAuthApi.ts
cp .pages_patch/portalAuthApi.test.ts app/src/features/auth/portalAuthApi.test.ts
cp .pages_patch/sessionManager.ts app/src/features/auth/sessionManager.ts
cp .pages_patch/sessionManager.test.ts app/src/features/auth/sessionManager.test.ts
cp .pages_patch/authProfileApi.ts app/src/features/auth/authProfileApi.ts
cp .pages_patch/authProfileApi.test.ts app/src/features/auth/authProfileApi.test.ts
cp .pages_patch/AuthProvider.tsx app/src/features/auth/AuthProvider.tsx
cp .pages_patch/AuthProvider.test.tsx app/src/features/auth/AuthProvider.test.tsx
cp .pages_patch/useSessionProfile.ts app/src/features/auth/useSessionProfile.ts
cp .pages_patch/ProtectedRoute.tsx app/src/features/auth/ProtectedRoute.tsx
cp .pages_patch/RoleRoute.tsx app/src/features/auth/RoleRoute.tsx
cp .pages_patch/LoginPage.tsx app/src/features/auth/LoginPage.tsx
cp .pages_patch/LoginPage.test.tsx app/src/features/auth/LoginPage.test.tsx
cp .pages_patch/authApi.ts app/src/features/auth/authApi.ts
cp .pages_patch/authApi.test.ts app/src/features/auth/authApi.test.ts
cp .pages_patch/recoveryRedirect.ts app/src/features/auth/recoveryRedirect.ts
cp .pages_patch/recoveryRedirect.test.ts app/src/features/auth/recoveryRedirect.test.ts
cp .pages_patch/SignupPage.tsx app/src/features/auth/SignupPage.tsx
cp .pages_patch/ForgotPasswordPage.tsx app/src/features/auth/ForgotPasswordPage.tsx
cp .pages_patch/ResetPasswordPage.tsx app/src/features/auth/ResetPasswordPage.tsx
cp .pages_patch/PendingApprovalPage.tsx app/src/features/auth/PendingApprovalPage.tsx
cp .pages_patch/supabase.ts app/src/lib/supabase.ts
cp .pages_patch/supabase.test.ts app/src/lib/supabase.test.ts
cp .pages_patch/providers.tsx app/src/app/providers.tsx
cp .pages_patch/Topbar.tsx app/src/components/layout/Topbar.tsx
cp .pages_patch/jobsApi.ts app/src/features/jobs/jobsApi.ts
cp .pages_patch/savedJobsApi.ts app/src/features/jobs/savedJobsApi.ts
cp .pages_patch/applicationsApi.ts app/src/features/applications/applicationsApi.ts
cp .pages_patch/profileApi.ts app/src/features/profile/profileApi.ts
cp .pages_patch/settingsApi.ts app/src/features/admin/settingsApi.ts
cp .pages_patch/notificationsApi.ts app/src/features/notifications/notificationsApi.ts
cp .pages_patch/noBrowserAuth.test.ts app/src/features/auth/noBrowserAuth.test.ts
cp .pages_patch/main.tsx app/src/main.tsx
```

Keep existing unrelated patches such as job publishing and approvals.

- [ ] **Step 2: Expand the CI test gate**

Run all critical auth tests plus existing critical job tests:

```bash
npm test -- --run \
  src/features/auth/sessionManager.test.ts \
  src/features/auth/portalAuthApi.test.ts \
  src/features/auth/authProfileApi.test.ts \
  src/features/auth/AuthProvider.test.tsx \
  src/features/auth/LoginPage.test.tsx \
  src/features/auth/authApi.test.ts \
  src/features/auth/recoveryRedirect.test.ts \
  src/features/auth/noBrowserAuth.test.ts \
  src/features/auth/RoleRoute.test.tsx \
  src/lib/supabase.test.ts \
  src/features/jobs/jobActions.test.ts \
  src/features/jobs/jobMappers.publish.test.ts
```

Then run:

```bash
npm run typecheck
npx vite build --base=/job-portal/
```

Expected: every command exits 0.

- [ ] **Step 3: Add an explicit grep gate as defense in depth**

```bash
if grep -R -nE 'supabase\.auth\.(getUser|getSession|signInWithPassword|onAuthStateChange|signOut)\(' app/src; then
  echo 'Forbidden Supabase browser Auth session call found.' >&2
  exit 1
fi
```

Expected: no matches.

- [ ] **Step 4: Run a new manual GitHub Pages workflow and verify green build + deploy**

Use the existing `workflow_dispatch` on `main`. Do not claim completion until the new run shows both `build` and `deploy` green for the commit containing this cutover.

- [ ] **Step 5: Execute the full same-browser acceptance sequence**

In one normal Chrome profile, without clearing storage manually:

1. Candidate1 sign in -> `/jobs`.
2. Candidate1 sign out -> `/login` immediately.
3. Akash sign in -> `/admin`.
4. Akash sign out -> `/login` immediately.
5. Mayank sign in -> `/admin`; Super Admin pages accessible.
6. Mayank sign out -> `/login` immediately.
7. Original Super Admin sign in -> `/admin`; Super Admin pages accessible.
8. Refresh the page while each account is signed in once; session should restore through TalentBridge storage without Supabase Auth SDK state.

Expected: no `Signing in…` hang, no Incognito requirement, no hard refresh, no password reset, no old account reappearing after logout.

- [ ] **Step 6: Verify live logs match the new architecture**

For login attempts, Supabase logs should show browser request to `/functions/v1/portal-auth` followed by server-side Auth traffic. The browser must not directly call `/auth/v1/token` from the GitHub Pages origin.

- [ ] **Step 7: Decommission the temporary `password-login` function without needing a delete API**

Redeploy `password-login` with `verify_jwt=false` and this entire body:

```ts
Deno.serve(() => new Response(JSON.stringify({ error: 'This endpoint has been retired' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
}))
```

Verify a call returns HTTP `410`. This removes the old authentication behavior even if the function slug cannot be deleted through the available management tool.

- [ ] **Step 8: Remove temporary browser workaround files from deployment**

Delete or stop copying `.pages_patch/directAuth.ts` and `.pages_patch/directAuth.test.ts`. Remove any workflow references to them. The `noBrowserAuth` test and grep gate remain permanently.

- [ ] **Step 9: Run final verification after decommission**

```bash
npm test -- --run src/features/auth/noBrowserAuth.test.ts src/features/auth/sessionManager.test.ts src/features/auth/portalAuthApi.test.ts src/features/auth/LoginPage.test.tsx
npm run typecheck
npx vite build --base=/job-portal/
```

Then run the GitHub Pages workflow one final time if the decommission commit changed frontend deployment files.

Expected: all tests/typecheck/build green and the deployed login acceptance sequence still passes.

- [ ] **Step 10: Commit Task 9**

```bash
git add .github/workflows/deploy-pages.yml .pages_patch supabase/functions/portal-auth/index.ts
git commit -m "chore(auth): complete simple auth cutover"
```

---

## Plan Self-Review Results

- **Spec coverage:** All spec sections are mapped: auth boundary (Task 2), session storage/refresh (Task 1), data client/RLS token propagation (Task 3), React state/routes (Task 4), login/logout/account switching (Task 5), removal of browser Auth discovery (Task 6), signup/recovery (Task 7), RLS/roles/refresh integration (Task 8), rollout/decommission/acceptance (Task 9).
- **Security coverage:** No browser secret key, no custom password hashing, no service-role use for login, no credential/token logging, local-first logout, bounded requests, RLS preserved, recovery redirect fixed/allowlisted, retired temporary endpoint returns 410.
- **Type consistency:** `TalentBridgeSession`, `getValidAccessToken`, `getCurrentUserId`, `reloadProfile`, and portal-auth action names are consistent across tasks.
- **Repository packaging:** Plan explicitly preserves the current ZIP + `.pages_patch` overlay and updates workflow copy/test gates rather than attempting an unrelated repository normalization.
- **No placeholders:** No `TBD`, `TODO`, “implement later,” or unspecified generic test/error-handling steps remain.
