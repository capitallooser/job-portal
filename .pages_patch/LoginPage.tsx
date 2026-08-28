import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { signIn } from './authApi'
import { loginSchema, type LoginInput } from './authSchemas'

export function LoginPage() {
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      setServerError('')
      await signIn(values)

      // The password grant is completed outside the Supabase auth client because
      // some browser builds can hang after a successful /token 200 while saving
      // the session. A full reload creates a fresh client that recovers the
      // persisted session before protected routes resolve profile/role access.
      window.history.replaceState(null, '', `${window.location.pathname}#/jobs`)
      window.location.reload()
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
