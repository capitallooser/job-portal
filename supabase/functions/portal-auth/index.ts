const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const PROD_ORIGIN = 'https://capitallooser.github.io'
const RESET_REDIRECT = 'https://capitallooser.github.io/job-portal/?talentbridge_recovery=1'

function cors(origin: string | null) {
  const allowedOrigins = new Set([
    PROD_ORIGIN,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : PROD_ORIGIN
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function toSession(payload: Record<string, unknown>) {
  const accessToken = payload.access_token
  const refreshToken = payload.refresh_token
  const user = payload.user as Record<string, unknown> | undefined

  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof user?.id !== 'string') {
    throw new Error('Incomplete Auth session')
  }

  const expiresIn = Number(payload.expires_in ?? 3600)
  const expiresAt = Number(payload.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn)

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: 'bearer' as const,
    user: {
      id: user.id,
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
    },
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(await req.text()) as Record<string, unknown>
  } catch {
    return json(origin, { error: 'Invalid request body' }, 400)
  }

  try {
    switch (body.action) {
      case 'login': {
        if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length < 8) {
          return json(origin, { error: 'Invalid email or password' }, 400)
        }
        const response = await authFetch('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: JSON.stringify({ email: body.email.trim(), password: body.password }),
        })
        const payload = await response.json() as Record<string, unknown>
        if (!response.ok) {
          return json(
            origin,
            { error: response.status === 400 ? 'Invalid email or password' : 'Unable to sign in' },
            response.status,
          )
        }
        return json(origin, toSession(payload))
      }

      case 'refresh': {
        if (typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) {
          return json(origin, { error: 'Invalid refresh token' }, 400)
        }
        const response = await authFetch('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: body.refreshToken }),
        })
        const payload = await response.json() as Record<string, unknown>
        if (!response.ok) return json(origin, { error: 'Session expired. Please sign in again.' }, 401)
        return json(origin, toSession(payload))
      }

      case 'logout': {
        if (typeof body.accessToken !== 'string' || body.accessToken.length < 20) {
          return json(origin, { ok: true })
        }
        await authFetch('/auth/v1/logout?scope=global', {
          method: 'POST',
          headers: { Authorization: `Bearer ${body.accessToken}` },
        })
        return json(origin, { ok: true })
      }

      case 'signup': {
        if (
          typeof body.email !== 'string'
          || typeof body.password !== 'string'
          || body.password.length < 8
          || typeof body.fullName !== 'string'
          || body.fullName.trim().length < 2
        ) {
          return json(origin, { error: 'Please complete all required signup fields' }, 400)
        }

        const response = await authFetch('/auth/v1/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: body.email.trim(),
            password: body.password,
            data: {
              full_name: body.fullName.trim(),
              mobile: typeof body.mobile === 'string' ? body.mobile.trim() : null,
            },
          }),
        })
        const payload = await response.json() as { msg?: string }
        if (!response.ok) return json(origin, { error: payload.msg || 'Unable to create account' }, response.status)
        return json(origin, { ok: true }, 201)
      }

      case 'request_password_reset': {
        if (typeof body.email !== 'string') return json(origin, { ok: true })
        await authFetch(`/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, {
          method: 'POST',
          body: JSON.stringify({ email: body.email.trim() }),
        })
        return json(origin, { ok: true })
      }

      case 'update_recovered_password': {
        if (
          typeof body.recoveryAccessToken !== 'string'
          || typeof body.password !== 'string'
          || body.password.length < 8
        ) {
          return json(origin, { error: 'Invalid recovery request' }, 400)
        }
        const response = await authFetch('/auth/v1/user', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${body.recoveryAccessToken}` },
          body: JSON.stringify({ password: body.password }),
        })
        if (!response.ok) return json(origin, { error: 'Recovery link is invalid or expired' }, 401)
        return json(origin, { ok: true })
      }

      default:
        return json(origin, { error: 'Unsupported authentication action' }, 400)
    }
  } catch {
    return json(origin, { error: 'Authentication service unavailable. Please try again.' }, 503)
  }
})
