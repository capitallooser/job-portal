import { queryClient } from '../../lib/queryClient'
import { supabase } from '../../lib/supabase'
import type { LoginInput, SignupInput } from './authSchemas'
import { loginWithPassword, revokeSession } from './portalAuthApi'
import { clearSession, getCurrentAccessToken, writeSession } from './sessionManager'

export async function signUpCandidate(input: SignupInput) {
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { full_name: input.fullName, mobile: input.mobile } } })
  if (error) throw error
  return data
}

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
  if (accessToken) void revokeSession(accessToken).catch(() => undefined)
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
