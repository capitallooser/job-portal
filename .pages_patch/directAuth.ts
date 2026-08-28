type PasswordCredentials = {
  email: string
  password: string
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): unknown
  removeItem(key: string): unknown
}

type DirectAuthOptions = {
  supabaseUrl: string
  publishableKey: string
  fetchImpl?: typeof fetch
  storage?: StorageLike
  now?: () => number
}

type AuthUser = {
  id: string
  email?: string
  [key: string]: unknown
}

type PasswordGrantPayload = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  expires_at?: number
  user?: AuthUser
  msg?: string
  error_description?: string
  error?: string
}

export function authStorageKey(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname
  const projectRef = hostname.split('.')[0]
  if (!projectRef) throw new Error('Unable to determine Supabase project reference')
  return `sb-${projectRef}-auth-token`
}

export async function passwordSignInDirect(
  credentials: PasswordCredentials,
  options: DirectAuthOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch
  const storage = options.storage ?? window.localStorage
  const now = options.now ?? Date.now
  const baseUrl = options.supabaseUrl.replace(/\/$/, '')

  const response = await fetchImpl(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: options.publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email.trim(),
      password: credentials.password,
    }),
  })

  let payload: PasswordGrantPayload = {}
  try {
    payload = await response.json() as PasswordGrantPayload
  } catch {
    // Keep a useful fallback error below if the response is unexpectedly not JSON.
  }

  if (!response.ok) {
    throw new Error(payload.msg || payload.error_description || payload.error || `Sign in failed (${response.status})`)
  }

  if (!payload.access_token || !payload.refresh_token || !payload.user) {
    throw new Error('Sign in succeeded but Supabase returned an incomplete session. Please try again.')
  }

  const expiresIn = payload.expires_in ?? 3600
  const session = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: payload.token_type ?? 'bearer',
    expires_in: expiresIn,
    expires_at: payload.expires_at ?? Math.floor(now() / 1000) + expiresIn,
    user: payload.user,
  }

  storage.setItem(authStorageKey(options.supabaseUrl), JSON.stringify(session))

  return {
    user: payload.user,
    session,
  }
}
