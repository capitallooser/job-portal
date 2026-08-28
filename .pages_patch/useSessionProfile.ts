import { getCurrentUserId } from './sessionManager'
import { fetchSessionProfileByUserId } from './authProfileApi'
import { useAuth } from './AuthProvider'

export async function fetchSessionProfile() {
  const userId = getCurrentUserId()
  if (!userId) return null
  return fetchSessionProfileByUserId(userId)
}

export function useSessionProfile() {
  const auth = useAuth()
  return {
    data: auth.profile,
    isLoading: auth.status === 'booting' || auth.status === 'loading_profile',
    error: auth.error ? new Error(auth.error) : null,
    refetch: auth.reloadProfile,
  }
}
