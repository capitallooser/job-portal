import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.status === 'booting' || auth.status === 'loading_profile') return <div className="full-loading"><div className="spinner" />Loading portal…</div>
  if (auth.status === 'signed_out') return <Navigate to="/login" replace />
  if (auth.status === 'pending_approval' || auth.status === 'rejected' || auth.status === 'blocked') return <Navigate to="/pending-approval" replace />
  if (auth.status === 'session_error') return <div className="full-loading">Unable to load your account. Please retry or sign in again.</div>
  return <>{children}</>
}
