import { LogOut, Menu } from 'lucide-react'
import { signOut } from '../../features/auth/authApi'
import { useSessionProfile } from '../../features/auth/useSessionProfile'
import { NotificationBell } from '../../features/notifications/NotificationBell'

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const { data: profile } = useSessionProfile()
  const handleSignOut = async () => { await signOut(); location.hash = '#/login' }
  return <header className="topbar"><button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open navigation"><Menu size={20} /></button><div className="top-spacer" /><NotificationBell/><div className="user-chip"><span>{profile?.full_name?.slice(0,1).toUpperCase()||'U'}</span><div><strong>{profile?.full_name||'User'}</strong><small>{profile?.role?.replace('_',' ')}</small></div></div><button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={()=>void handleSignOut()}><LogOut size={18}/></button></header>
}
