import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { useLang } from '../context/LangContext'
import type { Lang } from '../i18n/translations'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
]

export function Layout() {
  const { user, logout } = useAppContext()
  const { t, lang, setLang } = useLang()
  const location = useLocation()
  const navigate = useNavigate()

  const initials = user ? `${user.name[0]}${user.surname[0]}`.toUpperCase() : '??'
  const fullName = user ? `${user.name} ${user.surname}` : ''

  const pageTitle = (() => {
    if (location.pathname.startsWith('/month/')) return t('pageMonthDetail')
    if (location.pathname === '/settings') return t('navSettings')
    if (location.pathname === '/profile') return t('pageProfile')
    return t('pageReisekosten')
  })()

  return (
    <div style={s.shell}>
      {/* ── Sidebar ── */}
      <aside style={s.sidebar}>
        {/* Logo */}
        <div style={s.logoArea}>
          <div style={s.logoIcon}>✈</div>
          <span style={s.logoText}>TravelExp</span>
        </div>

        {/* Nav */}
        <nav style={s.nav}>
          {[
            { path: '/', label: t('navMonths'), icon: <CalendarIcon /> },
            { path: '/settings', label: t('navSettings'), icon: <SettingsIcon /> },
          ].map(item => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                style={{ ...s.navItem, ...(active ? s.navItemActive : {}) }}
                onClick={() => navigate(item.path)}
              >
                <span style={s.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* User avatar */}
        <div style={s.userArea}>
          <button style={s.avatarBtn} onClick={() => navigate('/profile')}>
            <div style={s.avatar}>{initials}</div>
            <div style={s.userInfo}>
              <span style={s.userName}>{fullName}</span>
              <span style={s.userSub}>{t('editProfile')}</span>
            </div>
          </button>
          <button style={s.logoutBtn} onClick={logout} title={t('logout')}>
            <LogoutIcon />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={s.main}>
        {/* Topbar */}
        <header style={s.topbar}>
          <span style={s.topbarTitle}>{pageTitle}</span>
          <div style={s.langSwitch}>
            {LANGS.map(l => (
              <button
                key={l.code}
                style={{ ...s.langBtn, ...(lang === l.code ? s.langBtnActive : {}) }}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </header>

        {/* Content */}
        <main style={s.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

const SIDEBAR_W = 240

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', height: '100vh', background: '#f0f4f8', fontFamily: "'Inter', 'Segoe UI', sans-serif" },

  sidebar: {
    width: SIDEBAR_W, minWidth: SIDEBAR_W,
    background: '#0f172a',
    display: 'flex', flexDirection: 'column',
    boxShadow: '2px 0 8px rgba(0,0,0,0.18)',
  },

  logoArea: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '20px 20px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  },
  logoIcon: {
    width: 36, height: 36, borderRadius: 10,
    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18,
  },
  logoText: { color: '#f1f5f9', fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' },

  nav: { flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 4 },

  navItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '10px 12px', border: 'none', borderRadius: 8,
    background: 'transparent', color: '#94a3b8',
    cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
    transition: 'all 0.15s',
  },
  navItemActive: {
    background: 'rgba(59,130,246,0.18)', color: '#60a5fa',
  },
  navIcon: { display: 'flex', alignItems: 'center', opacity: 0.9 },

  userArea: {
    display: 'flex', alignItems: 'center',
    padding: '12px 12px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    gap: 4,
  },
  avatarBtn: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '6px 8px', borderRadius: 8, textAlign: 'left',
    transition: 'background 0.15s',
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: '#fff', fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  userInfo: { display: 'flex', flexDirection: 'column' },
  userName: { color: '#e2e8f0', fontSize: 13, fontWeight: 600, lineHeight: 1.3 },
  userSub: { color: '#64748b', fontSize: 11 },
  logoutBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#475569', padding: 8, borderRadius: 6,
    display: 'flex', alignItems: 'center', transition: 'color 0.15s',
  },

  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },

  topbar: {
    height: 56, background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center',
    padding: '0 28px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  topbarTitle: { fontSize: 17, fontWeight: 700, color: '#0f172a' },

  langSwitch: { display: 'flex', alignItems: 'center', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 3 },
  langBtn: { padding: '4px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  langBtnActive: { background: '#fff', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },

  content: { flex: 1, overflowY: 'auto', padding: '24px 20px' },
}
