import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { signUpCandidate } from './authApi'
import { signupSchema, type SignupInput } from './authSchemas'

export function SignupPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) })

  if (sent) return <section className="auth-card">
    <div className="success-icon">✓</div>
    <h1>Account created</h1>
    <p>Your registration was submitted successfully. Your account is waiting for admin approval.</p>
    <p className="muted">You can sign in after an administrator approves your membership request.</p>
    <Link className="btn secondary" to="/login">Back to login</Link>
  </section>

  return <section className="auth-card">
    <div className="brand-mark">TB</div><p className="eyebrow">Private talent network</p><h1>Create your account</h1><p className="muted">Registration is free. Access begins after admin approval.</p>
    <form onSubmit={handleSubmit(async (values) => {
      try {
        setServerError('')
        await signUpCandidate(values)
        setSent(true)
      } catch (e) {
        setServerError(e instanceof Error ? e.message : 'Signup failed. Please try again.')
      }
    })} className="stack">
      <label>Full name<input {...register('fullName')} autoComplete="name" />{errors.fullName && <span className="field-error">{errors.fullName.message}</span>}</label>
      <label>Email<input type="email" {...register('email')} autoComplete="email" />{errors.email && <span className="field-error">{errors.email.message}</span>}</label>
      <label>Mobile number<input {...register('mobile')} autoComplete="tel" placeholder="+91 98765 43210" />{errors.mobile && <span className="field-error">{errors.mobile.message}</span>}</label>
      <label>Password<input type="password" {...register('password')} autoComplete="new-password" />{errors.password && <span className="field-error">{errors.password.message}</span>}</label>
      {serverError && <div className="alert error">{serverError}</div>}
      <button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Request access'}</button>
    </form><p className="auth-footer">Already registered? <Link to="/login">Sign in</Link></p>
  </section>
}
