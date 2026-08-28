import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RoleRoute } from './RoleRoute'
import { useAuth } from './AuthProvider'

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }))

const candidateProfile = {
  id: '1',
  full_name: 'Candidate',
  email: 'x@y.com',
  mobile: '1',
  approval_status: 'approved' as const,
  is_blocked: false,
  approved_at: null,
  created_at: '2026-01-01',
  role: 'candidate' as const,
}

describe('RoleRoute', () => {
  it('denies a candidate an admin-only child', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'approved_candidate',
      profile: candidateProfile,
      userId: candidateProfile.id,
      error: null,
      reloadProfile: vi.fn(),
    })
    render(<MemoryRouter><RoleRoute allowed={['admin']}><div>Secret admin</div></RoleRoute></MemoryRouter>)
    expect(screen.queryByText('Secret admin')).not.toBeInTheDocument()
  })
})
