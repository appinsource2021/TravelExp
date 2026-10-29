import { useState } from 'react'
import { api } from '../hooks/useApi'
import { useLang } from '../context/LangContext'
import type { MailAccount } from '../types/travel'

interface Props {
  account: MailAccount
  /** Kaydedilen hesabı üst bileşene bildirir */
  onSaved: (acc: MailAccount) => void
  onCancel: () => void
  onDeleted?: (id: string) => void
}

/** Sunucu hatayı ham gövdeyle fırlatıyor — içindeki mesajı çıkar */
function errMsg(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(msg)
    msg = parsed.error ?? parsed.message ?? msg
  } catch { /* düz metin geldiyse olduğu gibi */ }
  return msg
}

export function MailAccountEditor({ account, onSaved, onCancel, onDeleted }: Props) {
  const { t } = useLang()
  const [acc, setAcc] = useState<MailAccount>(account)
  // Şifreler sunucudan hiç gelmez; yalnızca kullanıcı yeni değer yazarsa gönderilir
  const [smtpPass, setSmtpPass] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null)

  const isNew = !acc._id
  const set = <K extends keyof MailAccount>(k: K, v: MailAccount[K]) =>
    setAcc(p => ({ ...p, [k]: v }))

  const payload = () => ({
    ...acc,
    ...(smtpPass ? { smtpPass } : {}),
    ...(imapPass ? { imapPass } : {}),
  })

  /** Kaydeder ve kaydedilmiş hesabı döndürür (test için de kullanılır) */
  const persist = async (): Promise<MailAccount> => {
    const saved = isNew
      ? await api.post<MailAccount>('/settings/accounts', payload())
      : await api.put<MailAccount>(`/settings/accounts/${acc._id}`, payload())
    setAcc(saved)
    setSmtpPass('')
    setImapPass('')
    return saved
  }

  const save = async () => {
    setBusy(true)
    setTest(null)
    try {
      onSaved(await persist())
    } catch (err) {
      setTest({ ok: false, msg: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  /** Test kayıtlı ayarlarla yapılır — bu yüzden önce kaydedilir. */
  const runTest = async (kind: 'smtp' | 'imap') => {
    setBusy(true)
    setTest(null)
    try {
      const saved = await persist()
      onSaved(saved)
      const res = await api.post<{ ok: boolean; message: string }>(
        `/settings/${kind}/test`, { accountId: saved._id })
      setTest({ ok: true, msg: res.message })
    } catch (err) {
      setTest({ ok: false, msg: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(t('accountConfirmDelete'))) return
    await api.delete(`/settings/accounts/${acc._id}`)
    onDeleted?.(acc._id)
  }

  return (
    <div style={s.box}>
      <div style={s.row}>
        <div style={{ ...s.field, flex: 1 }}>
          <label style={s.label}>{t('accountLabel')}</label>
          <input style={s.input} placeholder={t('accountLabelPh')}
            value={acc.label} onChange={e => set('label', e.target.value)} />
        </div>
        <div style={{ ...s.field, flex: 1 }}>
          <label style={s.label}>{t('accountFromName')}</label>
          <input style={s.input} value={acc.fromName}
            onChange={e => set('fromName', e.target.value)} />
        </div>
      </div>

      <div style={{ ...s.row, marginTop: 14 }}>
        <div style={{ ...s.field, flex: 1 }}>
          <label style={s.label}>{t('smtpHost')}</label>
          <input style={s.input} placeholder="smtp.office365.com"
            value={acc.smtpHost} onChange={e => set('smtpHost', e.target.value)} />
        </div>
        <div style={s.field}>
          <label style={s.label}>{t('smtpPort')}</label>
          <input style={{ ...s.input, width: 90, textAlign: 'center' }} type="number"
            value={acc.smtpPort} onChange={e => set('smtpPort', Number(e.target.value))} />
        </div>
      </div>

      <div style={{ ...s.field, marginTop: 14 }}>
        <label style={s.label}>{t('smtpUser')}</label>
        <input style={s.input} placeholder="ad.soyad@firma.com"
          value={acc.smtpUser} onChange={e => set('smtpUser', e.target.value)} />
      </div>

      <div style={{ ...s.field, marginTop: 14 }}>
        <label style={s.label}>{t('smtpPass')}</label>
        <input style={s.input} type="password" autoComplete="new-password"
          placeholder={acc.smtpPassSet ? t('smtpPassSaved') : ''}
          value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
      </div>

      <label style={s.check}>
        <input type="checkbox" checked={acc.smtpSecure}
          onChange={e => set('smtpSecure', e.target.checked)} />
        {t('smtpSecure')}
      </label>

      {/* ── Gönderilmiş kopyası ── */}
      <div style={s.divider} />
      <h4 style={s.subTitle}>{t('sentCopyTitle')}</h4>
      <p style={s.hint}>{t('sentCopyHint')}</p>

      <label style={s.check}>
        <input type="checkbox" checked={acc.saveToSent}
          onChange={e => set('saveToSent', e.target.checked)} />
        {t('sentCopyEnable')}
      </label>

      {acc.saveToSent && (
        <>
          <div style={{ ...s.row, marginTop: 14 }}>
            <div style={{ ...s.field, flex: 1 }}>
              <label style={s.label}>{t('imapHost')}</label>
              <input style={s.input} placeholder="imap.office365.com"
                value={acc.imapHost} onChange={e => set('imapHost', e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>{t('imapPort')}</label>
              <input style={{ ...s.input, width: 90, textAlign: 'center' }} type="number"
                value={acc.imapPort} onChange={e => set('imapPort', Number(e.target.value))} />
            </div>
          </div>

          <div style={{ ...s.field, marginTop: 14 }}>
            <label style={s.label}>{t('imapUser')}</label>
            <input style={s.input} value={acc.imapUser}
              onChange={e => set('imapUser', e.target.value)} />
          </div>

          <div style={{ ...s.field, marginTop: 14 }}>
            <label style={s.label}>{t('imapPass')}</label>
            <input style={s.input} type="password" autoComplete="new-password"
              placeholder={acc.imapPassSet ? t('smtpPassSaved') : ''}
              value={imapPass} onChange={e => setImapPass(e.target.value)} />
          </div>

          <div style={{ ...s.field, marginTop: 14 }}>
            <label style={s.label}>{t('sentFolder')}</label>
            <input style={s.input} placeholder="Sent / INBOX.Sent"
              value={acc.sentFolder} onChange={e => set('sentFolder', e.target.value)} />
          </div>

          <label style={s.check}>
            <input type="checkbox" checked={acc.imapSecure}
              onChange={e => set('imapSecure', e.target.checked)} />
            {t('imapSecure')}
          </label>
        </>
      )}

      {test && (
        <p style={{ ...s.result, color: test.ok ? '#2f855a' : '#c53030' }}>
          {test.ok ? '✓ ' : '✗ '}{test.msg}
        </p>
      )}

      <div style={s.actions}>
        {!isNew && onDeleted && (
          <button style={s.delBtn} onClick={remove} disabled={busy}>🗑</button>
        )}
        <div style={{ flex: 1 }} />
        <button style={s.ghostBtn} onClick={onCancel} disabled={busy}>✕</button>
        <button style={s.testBtn} onClick={() => runTest('smtp')} disabled={busy}>
          {busy ? t('smtpTesting') : t('smtpTest')}
        </button>
        {acc.saveToSent && (
          <button style={s.testBtn} onClick={() => runTest('imap')} disabled={busy}>
            {t('imapTest')}
          </button>
        )}
        <button style={s.saveBtn} onClick={save} disabled={busy}>{t('save')}</button>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  box: { border: '1px solid #cbd5e0', borderRadius: 10, padding: 18, background: '#f7fafc', marginTop: 12 },
  row: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, color: '#4a5568', fontWeight: 600 },
  input: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', boxSizing: 'border-box', width: '100%' },
  check: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#4a5568' },
  divider: { height: 1, background: '#e2e8f0', margin: '20px 0 16px' },
  subTitle: { fontSize: 14, fontWeight: 700, color: '#2d3748', margin: '0 0 6px' },
  hint: { fontSize: 12, color: '#718096', margin: '0 0 4px', lineHeight: 1.5 },
  result: { fontSize: 13, marginTop: 14, marginBottom: 0, lineHeight: 1.5 },
  actions: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 },
  delBtn: { background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 16 },
  ghostBtn: { background: '#fff', color: '#4a5568', border: '1px solid #cbd5e0', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  testBtn: { background: '#718096', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  saveBtn: { background: '#3182ce', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
}
