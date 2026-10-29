import { useEffect, useState } from 'react'
import { api } from '../hooks/useApi'
import { useLang } from '../context/LangContext'
import { MailAccountEditor } from '../components/MailAccountEditor'
import type { Destination, Settings, MailAccount, MailLog } from '../types/travel'

const DEFAULT_SETTINGS: Settings = {
  minCost: 1300, maxCost: 1400,
  emailTo: [], emailFrom: '',
  subjectPattern: 'Reisekosten {#Name} {#Year}-{#Month}',
  bodyText: 'Anbei die Reisekostenabrechnung für {#Month} {#Year}.',
  mailAccounts: [],
  aiHint: '', aiTolerance: 0,
  smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPassSet: false,
}

const EMPTY_ACCOUNT: MailAccount = {
  _id: '', label: '', fromName: '', isDefault: false,
  smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '',
  saveToSent: false,
  imapHost: '', imapPort: 993, imapSecure: true, imapUser: '', sentFolder: '',
}

export function SettingsPage() {
  const { t, monthNames } = useLang()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [newAddress, setNewAddress] = useState('')
  const [newKm, setNewKm] = useState('')
  const [newEmailTo, setNewEmailTo] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  // Düzenlenen hesabın id'si; yeni hesap için '__new__'
  const [editingAcc, setEditingAcc] = useState<string | null>(null)
  const [mailLog, setMailLog] = useState<MailLog[]>([])

  const loadMailLog = () =>
    api.get<MailLog[]>('/mail-log').then(setMailLog).catch(() => setMailLog([]))

  useEffect(() => {
    Promise.all([
      api.get<Destination[]>('/destinations'),
      api.get<Settings>('/settings').catch(() => DEFAULT_SETTINGS),
    ]).then(([dest, sett]) => {
      setDestinations(dest)
      setSettings({ ...DEFAULT_SETTINGS, ...sett })
      setLoading(false)
    })
    loadMailLog()
  }, [])

  /** Kaydedilen hesabı listeye işler; yeniyse ekler, varsa günceller. */
  const onAccountSaved = (acc: MailAccount) => {
    setSettings(p => {
      const exists = p.mailAccounts.some(a => a._id === acc._id)
      const list = exists
        ? p.mailAccounts.map(a => a._id === acc._id ? acc : a)
        : [...p.mailAccounts, acc]
      // Varsayılan tektir — sunucu da bunu uygular, arayüz onu yansıtır
      return { ...p, mailAccounts: acc.isDefault ? list.map(a => ({ ...a, isDefault: a._id === acc._id })) : list }
    })
    setEditingAcc(acc._id)
  }

  const onAccountDeleted = (id: string) => {
    setSettings(p => ({ ...p, mailAccounts: p.mailAccounts.filter(a => a._id !== id) }))
    setEditingAcc(null)
  }

  const makeDefault = async (id: string) => {
    const updated = await api.put<MailAccount>(`/settings/accounts/${id}`, { isDefault: true })
    setSettings(p => ({
      ...p,
      mailAccounts: p.mailAccounts.map(a => ({ ...a, isDefault: a._id === updated._id })),
    }))
  }

  const addDestination = async () => {
    if (!newAddress.trim() || !newKm) return
    const dest = await api.post<Destination>('/destinations', {
      address: newAddress.trim(),
      km: Number(newKm),
    })
    setDestinations(prev => [...prev, dest])
    setNewAddress('')
    setNewKm('')
  }

  const toggleDestination = async (id: string, active: boolean) => {
    await api.patch(`/destinations/${id}/toggle`, { active })
    setDestinations(prev => prev.map(d => d._id === id ? { ...d, active } : d))
  }

  const deleteDestination = async (id: string) => {
    if (!confirm(t('confirmDeleteAddress'))) return
    await api.delete(`/destinations/${id}`)
    setDestinations(prev => prev.filter(d => d._id !== id))
  }

  const saveSettings = async () => {
    const updated = await api.put<Settings>('/settings', settings)
    setSettings({ ...DEFAULT_SETTINGS, ...updated })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addEmailTo = async () => {
    const email = newEmailTo.trim()
    if (!email || settings.emailTo.includes(email)) return
    const updated = { ...settings, emailTo: [...settings.emailTo, email] }
    setSettings(updated)
    setNewEmailTo('')
    await api.put('/settings', updated)
  }

  const removeEmailTo = async (email: string) => {
    const updated = { ...settings, emailTo: settings.emailTo.filter(e => e !== email) }
    setSettings(updated)
    await api.put('/settings', updated)
  }

  if (loading) return <div style={s.center}>{t('loading')}</div>

  return (
    <div style={s.page}>
      <h1 style={s.title}>{t('settingsTitle')}</h1>

      {/* ── Destinations ── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t('addresses')}</h2>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 56, textAlign: 'center' }}>{t('active')}</th>
              <th style={s.th}>{t('addressCol')}</th>
              <th style={s.th}>km</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {destinations.map(d => (
              <tr key={d._id} style={{ opacity: d.active ? 1 : 0.45 }}>
                <td style={{ ...s.td, textAlign: 'center', width: 56 }}>
                  <input type="checkbox" checked={d.active}
                    onChange={() => toggleDestination(d._id, !d.active)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }} />
                </td>
                <td style={s.td}>{d.address}</td>
                <td style={{ ...s.td, textAlign: 'right', width: 80 }}>{d.km} km</td>
                <td style={{ ...s.td, width: 48 }}>
                  <button style={s.delBtn} onClick={() => deleteDestination(d._id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={s.addRow}>
          <input style={{ ...s.input, flex: 3 }} placeholder={t('addressPlaceholder')}
            value={newAddress} onChange={e => setNewAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDestination()} />
          <input style={{ ...s.input, flex: 1, maxWidth: 100 }} placeholder="km" type="number"
            value={newKm} onChange={e => setNewKm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDestination()} />
          <button style={s.addBtn} onClick={addDestination}>{t('addBtn')}</button>
        </div>
      </section>

      {/* ── Hedef tutar ── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t('monthlyTarget')}</h2>
        <p style={s.hint}>{t('shuffleHint')}</p>
        <div style={s.rangeRow}>
          <div style={s.rangeItem}>
            <label style={s.label}>{t('minimum')}</label>
            <input style={{ ...s.input, width: 100, textAlign: 'center' }} type="number"
              min={100} max={settings.maxCost - 1} value={settings.minCost}
              onChange={e => setSettings(p => ({ ...p, minCost: Number(e.target.value) }))} />
          </div>
          <span style={{ alignSelf: 'flex-end', paddingBottom: 10, color: '#718096' }}>—</span>
          <div style={s.rangeItem}>
            <label style={s.label}>{t('maximum')}</label>
            <input style={{ ...s.input, width: 100, textAlign: 'center' }} type="number"
              min={settings.minCost + 1} value={settings.maxCost}
              onChange={e => setSettings(p => ({ ...p, maxCost: Number(e.target.value) }))} />
          </div>
          <button style={{ ...s.addBtn, alignSelf: 'flex-end' }} onClick={saveSettings}>
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* ── E-posta Ayarları ── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t('emailSettings')}</h2>
        <p style={s.hint}>
          {t('emailVarsHint')} <code>{'{#Name}'}</code> <code>{'{#Year}'}</code> <code>{'{#Month}'}</code>
        </p>

        <div style={s.fieldGroup}>
          <label style={s.label}>{t('emailFrom')}</label>
          <input style={{ ...s.input, width: '100%' }} placeholder="ornek@firma.com"
            value={settings.emailFrom}
            onChange={e => setSettings(p => ({ ...p, emailFrom: e.target.value }))} />
        </div>

        <div style={{ ...s.fieldGroup, marginTop: 16 }}>
          <label style={s.label}>{t('emailTo')}</label>
          <div style={s.tagList}>
            {settings.emailTo.map(email => (
              <span key={email} style={s.tag}>
                {email}
                <button style={s.tagDel} onClick={() => removeEmailTo(email)}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ ...s.addRow, marginTop: 8 }}>
            <input style={{ ...s.input, flex: 1 }} placeholder="alici@firma.com"
              value={newEmailTo} onChange={e => setNewEmailTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmailTo()} />
            <button style={s.addBtn} onClick={addEmailTo}>{t('addBtn')}</button>
          </div>
        </div>

        <div style={{ ...s.fieldGroup, marginTop: 16 }}>
          <label style={s.label}>{t('emailSubject')}</label>
          <input style={{ ...s.input, width: '100%' }}
            placeholder="Reisekosten {#Name} {#Year}-{#Month}"
            value={settings.subjectPattern}
            onChange={e => setSettings(p => ({ ...p, subjectPattern: e.target.value }))} />
          <span style={s.preview}>
            {t('previewLabel')} {settings.subjectPattern
              .replace('{#Name}', 'Max Mustermann')
              .replace('{#Year}', String(new Date().getFullYear()))
              .replace('{#Month}', monthNames[new Date().getMonth()])}
          </span>
        </div>

        <div style={{ ...s.fieldGroup, marginTop: 16 }}>
          <label style={s.label}>{t('emailBody')}</label>
          <textarea style={{ ...s.input, width: '100%', minHeight: 80, resize: 'vertical' }}
            value={settings.bodyText}
            onChange={e => setSettings(p => ({ ...p, bodyText: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={s.addBtn} onClick={saveSettings}>
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* ── AI Yönergeleri ── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t('aiSectionTitle')}</h2>
        <p style={s.hint}>{t('aiSectionHint')}</p>

        <div style={s.fieldGroup}>
          <label style={s.label}>{t('aiHintLabel')}</label>
          <textarea
            style={{ ...s.input, width: '100%', minHeight: 130, resize: 'vertical',
                     fontFamily: 'inherit', lineHeight: 1.5 }}
            placeholder={t('aiHintPH')}
            value={settings.aiHint}
            onChange={e => setSettings(p => ({ ...p, aiHint: e.target.value }))} />
          <span style={s.preview}>{settings.aiHint.length} / 4000</span>
        </div>

        <div style={{ ...s.fieldGroup, marginTop: 16 }}>
          <label style={s.label}>{t('aiToleranceLabel')}</label>
          <input style={{ ...s.input, width: 110, textAlign: 'center' }}
            type="number" min={0} max={25}
            value={settings.aiTolerance}
            onChange={e => setSettings(p => ({
              ...p,
              aiTolerance: Math.min(25, Math.max(0, Number(e.target.value) || 0)),
            }))} />
          <span style={s.preview}>{t('aiToleranceHint')}</span>
          {settings.aiTolerance > 0 && (
            <span style={{ ...s.preview, color: '#2b6cb0' }}>
              {Math.round(settings.minCost * (1 - settings.aiTolerance / 100))} € – {Math.round(settings.maxCost * (1 + settings.aiTolerance / 100))} €
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={s.addBtn} onClick={saveSettings}>
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* ── Gönderen Hesapları ── */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>{t('accountsTitle')}</h2>
        <p style={s.hint}>{t('accountsHint')}</p>

        {settings.mailAccounts.length === 0 && editingAcc !== '__new__' && (
          <p style={s.empty}>{t('accountNone')}</p>
        )}

        {settings.mailAccounts.map(acc => (
          <div key={acc._id}>
            <div style={s.accRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.accLabel}>
                  {acc.label || acc.smtpUser}
                  {acc.isDefault && <span style={s.badge}>{t('accountDefault')}</span>}
                  {acc.saveToSent && <span style={s.badgeAlt}>IMAP</span>}
                </div>
                <div style={s.accSub}>{acc.smtpUser || '—'}</div>
              </div>
              {!acc.isDefault && (
                <button style={s.linkBtn} onClick={() => makeDefault(acc._id)}>
                  {t('accountMakeDefault')}
                </button>
              )}
              <button style={s.linkBtn}
                onClick={() => setEditingAcc(editingAcc === acc._id ? null : acc._id)}>
                {editingAcc === acc._id ? '▲' : '✎'}
              </button>
            </div>
            {editingAcc === acc._id && (
              <MailAccountEditor
                account={acc}
                onSaved={onAccountSaved}
                onCancel={() => setEditingAcc(null)}
                onDeleted={onAccountDeleted}
              />
            )}
          </div>
        ))}

        {editingAcc === '__new__' ? (
          <MailAccountEditor
            account={{ ...EMPTY_ACCOUNT, label: t('accountNew') }}
            onSaved={onAccountSaved}
            onCancel={() => setEditingAcc(null)}
          />
        ) : (
          <button style={{ ...s.addBtn, marginTop: 16 }} onClick={() => setEditingAcc('__new__')}>
            {t('accountAdd')}
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={s.addBtn} onClick={saveSettings}>
            {saved ? t('saved') : t('save')}
          </button>
        </div>
      </section>

      {/* ── Gönderim Geçmişi ── */}
      <section style={s.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ ...s.sectionTitle, marginBottom: 4 }}>{t('mailLogTitle')}</h2>
          <button style={s.linkBtn} onClick={loadMailLog}>{t('mailLogRefresh')}</button>
        </div>
        <p style={s.hint}>{t('mailLogHint')}</p>

        {mailLog.length === 0 ? (
          <p style={s.empty}>{t('mailLogEmpty')}</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t('mailLogWhen')}</th>
                <th style={s.th}>{t('mailLogMonth')}</th>
                <th style={s.th}>{t('mailLogFrom')}</th>
                <th style={s.th}>{t('mailLogTo')}</th>
                <th style={s.th}>{t('mailLogStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {mailLog.map(l => (
                <tr key={l._id}>
                  <td style={s.td}>{new Date(l.createdAt).toLocaleString()}</td>
                  <td style={s.td}>{l.monthLabel}</td>
                  <td style={s.td}>{l.fromAddress}</td>
                  <td style={s.td}>{l.to.join(', ')}</td>
                  <td style={s.td}>
                    <span style={{ color: l.ok ? '#2f855a' : '#c53030', fontWeight: 600 }}>
                      {l.ok ? '✓ ' + t('mailLogOk') : '✗ ' + t('mailLogFail')}
                    </span>
                    {l.ok && (
                      <div style={s.subNote}>
                        {l.savedToSent
                          ? `✓ ${t('mailLogSaved')}${l.sentFolder ? ` (${l.sentFolder})` : ''}`
                          : l.saveError ? `⚠ ${t('mailLogNotSaved')}: ${l.saveError}` : ''}
                      </div>
                    )}
                    {!l.ok && l.error && <div style={s.subNote}>{l.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 640, margin: '0 auto' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' },
  title: { display: 'none' },
  section: { background: '#fff', borderRadius: 14, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#2d3748', marginTop: 0 },
  hint: { fontSize: 13, color: '#718096', marginBottom: 16, marginTop: -8 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 16 },
  th: { textAlign: 'left', padding: '6px 10px', background: '#edf2f7', fontSize: 12, color: '#718096', borderBottom: '1px solid #e2e8f0' },
  td: { padding: '10px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 14 },
  delBtn: { background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 16 },
  addRow: { display: 'flex', gap: 8, alignItems: 'center' },
  rangeRow: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  rangeItem: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, color: '#4a5568', fontWeight: 600 },
  input: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', boxSizing: 'border-box' },
  addBtn: { background: '#3182ce', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  tagList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { display: 'flex', alignItems: 'center', gap: 6, background: '#ebf4ff', color: '#2b6cb0', borderRadius: 6, padding: '4px 10px', fontSize: 13 },
  tagDel: { background: 'none', border: 'none', color: '#2b6cb0', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 },
  preview: { fontSize: 12, color: '#718096', marginTop: 4 },
  empty: { fontSize: 13, color: '#a0aec0', fontStyle: 'italic', margin: '8px 0' },
  accRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #e2e8f0' },
  accLabel: { fontSize: 14, fontWeight: 600, color: '#2d3748', display: 'flex', alignItems: 'center', gap: 8 },
  accSub: { fontSize: 12, color: '#718096', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge: { background: '#c6f6d5', color: '#22543d', borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  badgeAlt: { background: '#bee3f8', color: '#2a4365', borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  linkBtn: { background: 'none', border: 'none', color: '#3182ce', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  subNote: { fontSize: 11, color: '#718096', marginTop: 3, lineHeight: 1.4 },
}
