import { supabase } from '../../lib/supabase'
import type { LoginInput, SignupInput } from './authSchemas'

const SIGNUP_TIMEOUT_MS = 10_000

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = SIGNUP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Signup is taking longer than expected. Your account may already have been created. Please wait a moment, then try signing in instead of submitting again.')), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function signUpCandidate(input: SignupInput) {
  const result = await withTimeout(supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, mobile: input.mobile } },
  }))

  if (result.error) throw result.error

  if (result.data.session) {
    await supabase.auth.signOut()
  }

  return result.data
}

export async function signIn(input: LoginInput) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
