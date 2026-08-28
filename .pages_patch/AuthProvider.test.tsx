import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionProfile } from '../../types/domain'
import { AuthProvider, classifyProfile, useAuth } from './AuthProvider'
import { fetchSessionProfileByUserId } from './authProfileApi'
import { getCurrentUserId, subscribeSession } from './sessionManager'

vi.mock('./authProfileApi', async () => {
  const actual = await vi.importActual<typeof import('./authProfileApi')>('./authProfileApi')
  return { ...actual, fetchSessionProfileByUserId: vi.fn() }
})
vi.mock('./sessionManager', () => ({
  getCurrentUserId: vi.fn(),
  getValidAccessToken: vi.fn(async () => null),
  subscribeSession: vi.fn(() => () => undefined),
}))

const base: SessionProfile = { id: 'u1', full_name: 'Candidate One', email: 'candidate1@neepanlok.com', mobile: '9999999999', approval_status: 'approved', is_blocked: false, approved_at: null, created_at: '2026-08-28T00:00:00Z', role: 'candidate' }
function Probe() { const auth = useAuth(); return <div>{auth.status}</div> }

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserId).mockReset()
    vi.mocked(fetchSessionProfileByUserId).mockReset()
    vi.mocked(subscribeSession).mockReturnValue(() => undefined)
  })
  it('settles signed out when no TalentBridge session exists', async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('signed_out')).toBeInTheDocument())
  })
  it('loads an approved candidate profile', async () => {
    vi.mocked(getCurrentUserId).mockReturnValue('u1')
    vi.mocked(fetchSessionProfileByUserId).mockResolvedValue(base)
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('approved_candidate')).toBeInTheDocument())
  })
  it('classifies privileged and approval states explicitly', () => {
    expect(classifyProfile({ ...base, role: 'admin' })).toBe('approved_privileged')
    expect(classifyProfile({ ...base, approval_status: 'pending_approval' })).toBe('pending_approval')
    expect(classifyProfile({ ...base, approval_status: 'rejected' })).toBe('rejected')
    expect(classifyProfile({ ...base, is_blocked: true })).toBe('blocked')
  })
})
