import { useEffect, useState } from 'react'
import { api } from '../hooks/useApi'
import { useAppContext } from '../context/AppContext'
import { useLang } from '../context/LangContext'
import type { Profile } from '../types/travel'

export function ProfilePage() {
  const { user } = useAppContext()
  const { t } = useLang()
  const [profile, setProfile] = useState<Profile>({ homeAddress: '', firma: '', name: '', surname: '', birthDate: '' })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Profile>('/profile')
      .then(p => {
        setProfile({
          ...p,
          name: p.name || user?.name || '',
          surname: p.surname || user?.surname || '',
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    await api.put('/profile', profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={s.center}>{t('loading')}</div>

  const initials = `${profile.name?.[0] || '?'}${profile.surname?.[0] || ''}`.toUpperCase()

  return (
    <div style={s.page}>

      {/* ── Kullanıcı Kartı ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={s.avatarLg}>{initials}</div>
          <div>
            <div style={s.cardTitle}>{t('userInfo')}</div>
            <div style={s.cardSub}>{t('userInfoSub')}</div>
          </div>
        </div>
        <div style={s.grid2}>
          <div style={s.field}>
            <label style={s.label}>{t('firstName')}</label>
            <input style={s.input} value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              placeholder={t('firstNamePH')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('lastName')}</label>
            <input style={s.input} value={profile.surname}
              onChange={e => setProfile(p => ({ ...p, surname: e.target.value }))}
              placeholder={t('lastNamePH')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('birthDate')}</label>
            <input style={s.input} type="date" value={profile.birthDate}
              onChange={e => setProfile(p => ({ ...p, birthDate: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* ── Adres & Firma Kartı ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div style={{ ...s.cardIcon, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>🏠</div>
          <div>
            <div style={s.cardTitle}>{t('addressFirma')}</div>
            <div style={s.cardSub}>{t('addressFirmaSub')}</div>
          </div>
        </div>
        <div style={s.grid1}>
          <div style={s.field}>
            <label style={s.label}>{t('firmaLabel')}</label>
            <input style={s.input} value={profile.firma}
              onChange={e => setProfile(p => ({ ...p, firma: e.target.value }))}
              placeholder={t('firmaPH')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('homeAddress')}</label>
            <input style={s.input} value={profile.homeAddress}
              onChange={e => setProfile(p => ({ ...p, homeAddress: e.target.value }))}
              placeholder={t('homeAddressPH')} />
          </div>
        </div>
      </div>

      <div style={s.saveRow}>
        <button style={s.btnSave} onClick={save}>
          {saved ? t('saved') : t('save')}
        </button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' },
  page: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 },
  card: { background: '#fff', borderRadius: 14, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  avatarLg: {
    width: 48, height: 48, borderRadius: '50%',
    background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
    color: '#fff', fontSize: 17, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: 12, fontSize: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  grid1: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' },
  input: { padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#0f172a', outline: 'none', background: '#f8fafc' },
  saveRow: { display: 'flex', justifyContent: 'flex-end' },
  btnSave: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
}
