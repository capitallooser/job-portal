import { signOut } from './authApi'
import { useAuth } from './AuthProvider'

export function PendingApprovalPage() {
  const auth = useAuth()
  const copy = auth.status === 'blocked' ? { icon:'⛔', eyebrow:'Account access', title:'Account blocked', body:'Your account is currently blocked. Please contact an administrator.' } : auth.status === 'rejected' ? { icon:'✕', eyebrow:'Membership review', title:'Access not approved', body:'Your membership request was not approved. Please contact an administrator if you believe this is incorrect.' } : { icon:'⏳', eyebrow:'Membership review', title:'Access pending', body:'Your email is registered. An administrator must approve your account before protected jobs become visible.' }
  const handleSignOut = async () => { await signOut(); location.hash = '#/login' }
  return <section className="auth-card"><div className="status-orb">{copy.icon}</div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="muted">{copy.body}</p><button className="btn secondary" onClick={()=>void handleSignOut()}>Sign out</button></section>
}
