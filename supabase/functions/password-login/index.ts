const ALLOWED_ORIGINS = new Set([
  'https://capitallooser.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
])

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://capitallooser.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ msg: 'Method not allowed' }), { status: 405, headers })
  }

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ msg: 'Origin not allowed' }), { status: 403, headers })
  }

  let credentials: { email?: string; password?: string } = {}
  try {
    credentials = JSON.parse(await req.text())
  } catch {
    return new Response(JSON.stringify({ msg: 'Invalid request body' }), { status: 400, headers })
  }

  const email = credentials.email?.trim()
  const password = credentials.password
  if (!email || !password) {
    return new Response(JSON.stringify({ msg: 'Email and password are required' }), { status: 400, headers })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ msg: 'Authentication service is not configured' }), { status: 500, headers })
  }

  const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers,
  })
})
