import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionProfile } from '../../types/domain'
import type { AuthState, AuthStatus } from './authTypes'
import { fetchSessionProfileByUserId } from './authProfileApi'
import { getCurrentUserId, subscribeSession } from './sessionManager'

export type AuthContextValue = AuthState & { reloadProfile: () => Promise<SessionProfile | null> }
const INITIAL_STATE: AuthState = { status: 'booting', profile: null, userId: null, error: null }
const AuthContext = createContext<AuthContextValue | null>(null)

export function classifyProfile(profile: SessionProfile): AuthStatus {
  if (profile.is_blocked) return 'blocked'
  if (profile.approval_status === 'pending_approval') return 'pending_approval'
  if (profile.approval_status === 'rejected') return 'rejected'
  return profile.role === 'candidate' ? 'approved_candidate' : 'approved_privileged'
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE)
  const requestSequence = useRef(0)
  const reloadProfile = useCallback(async () => {
    const userId = getCurrentUserId()
    const requestId = ++requestSequence.current
    if (!userId) {
      setState({ status: 'signed_out', profile: null, userId: null, error: null })
      return null
    }
    setState((current) => ({ ...current, status: 'loading_profile', userId, error: null }))
    try {
      const profile = await fetchSessionProfileByUserId(userId)
      if (requestSequence.current !== requestId || getCurrentUserId() !== userId) return null
      setState({ status: classifyProfile(profile), profile, userId, error: null })
      return profile
    } catch (error) {
      if (requestSequence.current !== requestId || getCurrentUserId() !== userId) return null
      const message = error instanceof Error ? error.message : 'Unable to load account'
      setState({ status: 'session_error', profile: null, userId, error: message })
      throw error
    }
  }, [])
  useEffect(() => {
    void reloadProfile().catch(() => undefined)
    return subscribeSession(() => { void reloadProfile().catch(() => undefined) })
  }, [reloadProfile])
  const value = useMemo<AuthContextValue>(() => ({ ...state, reloadProfile }), [state, reloadProfile])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
