import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { queryClient } from '../../lib/queryClient'
import { signIn, withTimeout } from './authApi'
import { loginSchema, type LoginInput } from './authSchemas'
import { fetchSessionProfile } from './useSessionProfile'

const PROFILE_TIMEOUT_MS = 8_000
const PROFILE_TIMEOUT_MESSAGE = 'You are signed in, but loading your portal access is taking longer than expected. Please refresh the page and try again.'

export function LoginPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      setServerError('')

      const auth = await signIn(values)
      const userId = auth.user?.id
      if (!userId) throw new Error('Sign in completed, but no user session was returned. Please refresh and try again.')

      const profile = await withTimeout(
        fetchSessionProfile(userId),
        PROFILE_TIMEOUT_MS,
        PROFILE_TIMEOUT_MESSAGE,
      )
      if (!profile) throw new Error('Your account was signed in, but your portal profile could not be loaded. Please refresh and try again.')

      queryClient.setQueryData(['session-profile'], profile)

      if (profile.is_blocked || profile.approval_status !== 'approved') {
        navigate('/pending-approval', { replace: true })
        return
      }

      navigate(profile.role === 'candidate' ? '/jobs' : '/admin', { replace: true })
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Login failed. Please try again.')
    }
  })

  return <section className="auth-card">
    <div className="brand-mark">TB</div>
    <p className="eyebrow">Welcome back</p>
    <h1>Sign in</h1>
    <p className="muted">Use the email connected to your portal account.</p>
    <form className="stack" onSubmit={onSubmit}>
      <label>Email
        <input type="email" {...register('email')} autoComplete="email" />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </label>
      <label>Password
        <input type="password" {...register('password')} autoComplete="current-password" />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </label>
      {serverError && <div className="alert error">{serverError}</div>}
      <button className="btn primary" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
    <div className="auth-links">
      <Link to="/forgot-password">Forgot password?</Link>
      <Link to="/signup">Request membership</Link>
    </div>
  </section>
}
