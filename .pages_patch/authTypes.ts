import type { SessionProfile } from '../../types/domain'

export type TalentBridgeSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  tokenType: 'bearer'
  user: {
    id: string
    email?: string
  }
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
