import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { signIn } from './authApi'
import { useAuth } from './AuthProvider'

vi.mock('./authApi', () => ({ signIn: vi.fn() }))
vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }))
const baseProfile = { id:'u1', full_name:'User', email:'u@example.com', mobile:null, approval_status:'approved' as const, is_blocked:false, approved_at:null, created_at:'2026-08-28T00:00:00Z', role:'candidate' as const }
function renderLogin(){return render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/jobs" element={<div>Candidate jobs</div>}/><Route path="/admin" element={<div>Admin home</div>}/><Route path="/pending-approval" element={<div>Pending access</div>}/></Routes></MemoryRouter>)}

describe('LoginPage routing',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(signIn).mockResolvedValue({} as never)})
  it('routes an approved candidate to jobs',async()=>{vi.mocked(useAuth).mockReturnValue({reloadProfile:vi.fn().mockResolvedValue(baseProfile)} as never);renderLogin();const user=userEvent.setup();await user.type(screen.getByLabelText('Email'),'candidate1@neepanlok.com');await user.type(screen.getByLabelText('Password'),'Password123!');await user.click(screen.getByRole('button',{name:'Sign in'}));expect(await screen.findByText('Candidate jobs')).toBeInTheDocument()})
  it('routes an approved admin to admin',async()=>{vi.mocked(useAuth).mockReturnValue({reloadProfile:vi.fn().mockResolvedValue({...baseProfile,role:'admin'})} as never);renderLogin();const user=userEvent.setup();await user.type(screen.getByLabelText('Email'),'akash@neepanlok.com');await user.type(screen.getByLabelText('Password'),'Password123!');await user.click(screen.getByRole('button',{name:'Sign in'}));expect(await screen.findByText('Admin home')).toBeInTheDocument()})
  it('shows an auth error and restores the sign-in button',async()=>{vi.mocked(useAuth).mockReturnValue({reloadProfile:vi.fn()} as never);vi.mocked(signIn).mockRejectedValue(new Error('Invalid email or password'));renderLogin();const user=userEvent.setup();await user.type(screen.getByLabelText('Email'),'candidate1@neepanlok.com');await user.type(screen.getByLabelText('Password'),'Password123!');await user.click(screen.getByRole('button',{name:'Sign in'}));expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Sign in'})).toBeEnabled()})
})
