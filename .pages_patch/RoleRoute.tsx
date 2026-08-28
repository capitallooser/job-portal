import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { AppRole } from '../../types/domain'
import { useAuth } from './AuthProvider'

export function RoleRoute({ allowed, children }: { allowed: AppRole[]; children: ReactNode }) {
  const auth = useAuth()
  if (auth.status === 'booting' || auth.status === 'loading_profile') return <div className="full-loading">Loading…</div>
  if (auth.status === 'signed_out') return <Navigate to="/login" replace />
  if (auth.status === 'pending_approval' || auth.status === 'rejected' || auth.status === 'blocked') return <Navigate to="/pending-approval" replace />
  if (auth.status === 'session_error' || !auth.profile) return <div className="full-loading">Unable to load your account. Please retry or sign in again.</div>
  if (!allowed.includes(auth.profile.role)) return <Navigate to={auth.profile.role === 'candidate' ? '/jobs' : '/admin'} replace />
  return <>{children}</>
}
