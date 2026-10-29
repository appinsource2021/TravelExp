import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../hooks/useApi'
import { useAppContext } from '../context/AppContext'
import { useLang } from '../context/LangContext'
import type { Month, Profile } from '../types/travel'

export function MonthListPage() {
  const { user } = useAppContext()
  const { t, monthNames } = useLang()
  const [months, setMonths] = useState<Month[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newYear, setNewYear] = useState(new Date().getFullYear())
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [data, prof] = await Promise.all([
        api.get<Month[]>('/months'),
        api.get<Profile>('/profile').catch(() => null),
      ])
      setMonths(data)
      setProfile(prof)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addMonth = async () => {
    await api.post('/months', { year: newYear, month: newMonth })
    setShowAdd(false)
    load()
  }

  const deleteMonth = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('confirmDeleteMonth'))) return
    await api.delete(`/months/${id}`)
    load()
  }

  if (loading) return <div style={s.center}>{t('loading')}</div>

  const fullName = user ? `${user.name} ${user.surname}` : ''
  const initials = user ? `${user.name[0]}${user.surname[0]}`.toUpperCase() : '?'
  const totalAll = months.reduce((sum, m) => sum + m.totalCost, 0)

  return (
    <div>
      {/* ── Banner ── */}
      <div style={s.banner}>
        <div style={s.bannerLeft}>
          <div style={s.bannerAvatar}>{initials}</div>
          <div>
            <div style={s.bannerName}>{fullName}</div>
            <div style={s.bannerFirma}>{profile?.firma || '—'}</div>
            {profile?.homeAddress && (
              <div style={s.bannerAddress}>{profile.homeAddress}</div>
            )}
          </div>
        </div>
        <div style={s.bannerStats}>
          <div style={s.statBox}>
            <span style={s.statNum}>{months.length}</span>
            <span style={s.statLabel}>{t('totalMonths')}</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statBox}>
            <span style={s.statNum}>{totalAll.toFixed(2).replace('.', ',')} €</span>
            <span style={s.statLabel}>{t('totalAmount')}</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statBox}>
            <span style={s.statNum}>{months.filter(m => m.mailSent).length}</span>
            <span style={s.statLabel}>{t('statSent')}</span>
          </div>
        </div>
      </div>

      <div style={s.toolbar}>
        <span style={s.count}>{months.length} {t('records')}</span>
        <button style={s.btnPrimary} onClick={() => setShowAdd(true)}>{t('addMonth')}</button>
      </div>

      {showAdd && (
        <div style={s.overlay}>
          <div style={s.modalBox}>
            <h3 style={s.modalTitle}>{t('addNewMonth')}</h3>
            <div style={s.row}>
              <select style={s.select} value={newYear} onChange={e => setNewYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select style={s.select} value={newMonth} onChange={e => setNewMonth(Number(e.target.value))}>
                {monthNames.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div style={{ ...s.row, justifyContent: 'flex-end' }}>
              <button style={s.btnSecondary} onClick={() => setShowAdd(false)}>{t('cancel')}</button>
              <button style={s.btnPrimary} onClick={addMonth}>{t('add')}</button>
            </div>
          </div>
        </div>
      )}

      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t('colYear')}</th>
              <th style={s.th}>{t('colMonth')}</th>
              <th style={s.th}>{t('colPerson')}</th>
              <th style={s.th}>{t('colTotal')}</th>
              <th style={s.th}>{t('colStatus')}</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 && (
              <tr>
                <td colSpan={6} style={s.empty}>{t('noMonths')}</td>
              </tr>
            )}
            {months.map(m => (
              <tr key={m._id} style={s.tr} onClick={() => navigate(`/month/${m._id}`)}>
                <td style={s.td}>{m.year}</td>
                <td style={s.td}>{monthNames[m.month - 1]}</td>
                <td style={s.td}>{m.personName}</td>
                <td style={{ ...s.td, fontWeight: 700, color: '#059669' }}>
                  {m.totalCost.toFixed(2).replace('.', ',')} €
                </td>
                <td style={s.td}>
                  {m.mailSent
                    ? <span style={s.badgeSent}>{t('statusSent')}</span>
                    : <span style={s.badgePending}>{t('statusPending')}</span>}
                </td>
                <td style={s.td}>
                  <button style={s.delBtn} onClick={e => deleteMonth(m._id, e)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' },

  banner: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
    borderRadius: 14, padding: '24px 28px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, gap: 16, flexWrap: 'wrap',
    boxShadow: '0 4px 16px rgba(30,64,175,0.25)',
  },
  bannerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  bannerAvatar: {
    width: 52, height: 52, borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    backdropFilter: 'blur(4px)',
    color: '#fff', fontSize: 18, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid rgba(255,255,255,0.35)',
    flexShrink: 0,
  },
  bannerName: { color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 3 },
  bannerFirma: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500 },
  bannerAddress: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  bannerStats: { display: 'flex', alignItems: 'center', gap: 0 },
  statBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px' },
  statNum: { color: '#fff', fontSize: 18, fontWeight: 700 },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap' },
  statDivider: { width: 1, height: 36, background: 'rgba(255,255,255,0.2)' },

  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  count: { fontSize: 13, color: '#64748b' },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '11px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  td: { padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 14, color: '#1e293b', cursor: 'pointer' },
  tr: { transition: 'background 0.1s' },
  empty: { textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 },
  delBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '2px 6px', borderRadius: 4 },
  badgeSent: { background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  badgePending: { background: '#f1f5f9', color: '#94a3b8', borderRadius: 6, padding: '3px 10px', fontSize: 12 },
  btnPrimary: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnSecondary: { background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 14 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalBox: { background: '#fff', borderRadius: 14, padding: 32, minWidth: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTitle: { margin: '0 0 20px', fontSize: 18, color: '#0f172a' },
  row: { display: 'flex', gap: 12, marginBottom: 16 },
  select: { flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#1e293b' },
}
