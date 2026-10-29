import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../hooks/useApi'
import { useLang } from '../context/LangContext'
import { translations } from '../i18n/translations'
import type { Month, Position, Profile, MailLog } from '../types/travel'
import { REISEZWECK_OPTIONS } from '../types/travel'
import { exportToPdf, exportToPdfBase64, buildPdfFilename } from '../utils/exportPdf'
import { ExcelImportModal } from '../components/ExcelImportModal'
import { documentLockedUntil, lastTripEnd, berlinNowKey, addMinutesToKey, splitKey } from '../utils/tripEnd'

export function MonthDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, monthNames } = useLang()
  const [month, setMonth] = useState<Month | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [shuffling, setShuffling] = useState(false)
  const [aiNote, setAiNote] = useState<{ ok: boolean; msg: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [mailLog, setMailLog] = useState<MailLog[]>([])
  // Sayfa açık kalırsa son seyahat bittiği anda kilit kendiliğinden kalksın
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const [delay, setDelay] = useState(45)

  // Otomatik gönderim vakti geçtiyse sunucu göndermiştir — durumu tazele
  useEffect(() => {
    if (!month?.autoSend?.enabled || month.mailSent) return
    const end = lastTripEnd(positions)
    if (end && berlinNowKey(now) >= addMinutesToKey(end.key, month.autoSend.delayMinutes)) load()
  }, [now])

  const load = async () => {
    if (!id) return
    const [months, pos, prof] = await Promise.all([
      api.get<Month[]>('/months'),
      api.get<Position[]>(`/months/${id}/positions`),
      api.get<Profile>('/profile').catch(() => null),
    ])
    const found = months.find(m => m._id === id) ?? null
    setMonth(found)
    setDelay(found?.autoSend?.delayMinutes ?? 45)
    setPositions(pos)
    setProfile(prof)
    setLoading(false)
    loadMailLog()
  }

  const loadMailLog = () =>
    api.get<MailLog[]>(`/months/${id}/mail-log`).then(setMailLog).catch(() => setMailLog([]))

  useEffect(() => { load() }, [id])

  const shuffle = async (useAi = false) => {
    if (!id) return
    setShuffling(true)
    setAiNote(null)
    try {
      const res = await api.post<{
        positions: Position[]; total: number
        generatedBy?: string; generatedNote?: string; aiError?: string
      }>(`/months/${id}/shuffle`, { useAi })
      // AI istendi ama başarısız olduysa sunucu klasik üretime döner —
      // kullanıcı bunu bilmeli, sessizce yutma
      if (useAi) {
        setAiNote(res.aiError
          ? { ok: false, msg: res.aiError }
          : { ok: true, msg: res.generatedNote || '' })
      }
      setPositions(res.positions)
      setMonth(prev => prev ? { ...prev, totalCost: res.total } : prev)
      await refreshAutoSendPdf(res.positions)
    } finally {
      setShuffling(false)
    }
  }

  // Otomatik gönderim: PDF tarayıcıda üretilip sunucuya bırakılır, vakti
  // gelince sunucu gönderir. Kapatırken yalnızca bekleme süresi saklanır.
  const syncAutoSend = async (enabled: boolean, delayMinutes: number, pos: Position[] = positions) => {
    if (!month || !id) return
    try {
      const res = await api.put<{ autoSend: Month['autoSend'] }>(`/months/${id}/auto-send`, {
        enabled, delayMinutes,
        ...(enabled ? {
          pdfBase64: exportToPdfBase64(month, pos, profile?.firma ?? 'Norm Services GmbH'),
          pdfFilename: buildPdfFilename(month),
        } : {}),
      })
      setMonth(prev => prev ? { ...prev, autoSend: res.autoSend } : prev)
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Pozisyonlar değişince sunucu saklanan PDF'i siler — açıksa güncelini yükle
  const refreshAutoSendPdf = async (pos: Position[]) => {
    if (month?.autoSend?.enabled) await syncAutoSend(true, month.autoSend.delayMinutes, pos)
  }

  const sendEmail = async () => {
    if (!month || positions.length === 0 || documentLockedUntil(positions)) return
    setSending(true)
    try {
      const pdfBase64 = exportToPdfBase64(month, positions, profile?.firma ?? 'Norm Services GmbH')
      const pdfFilename = buildPdfFilename(month)
      await api.post(`/months/${id}/send-email`, { pdfBase64, pdfFilename })
      setMonth(prev => prev ? { ...prev, mailSent: true } : prev)
      await loadMailLog()
    } catch (err: any) {
      await loadMailLog()   // başarısız deneme de geçmişe yazılır
      alert(t('mailError') + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleImport = async (rows: Parameters<React.ComponentProps<typeof ExcelImportModal>['onImport']>[0]) => {
    if (!id) return
    const res = await api.post<{ positions: Position[]; total: number }>(`/months/${id}/positions/bulk`, { positions: rows })
    setPositions(res.positions)
    setMonth(prev => prev ? { ...prev, totalCost: res.total } : prev)
    await refreshAutoSendPdf(res.positions)
  }

  const updateReisezweck = async (posId: string, val: string) => {
    await api.put(`/positions/${posId}`, { reisezweck: val })
    const next = positions.map(p => p._id === posId ? { ...p, reisezweck: val } : p)
    setPositions(next)
    await refreshAutoSendPdf(next)
  }

  // Tarih değişince sunucu satırları yeniden sıralar — listeyi baştan çek
  const updateDate = async (posId: string, iso: string) => {
    if (!iso) return
    const [y, m, d] = iso.split('-')
    try {
      await api.put(`/positions/${posId}`, { date: `${d}.${m}.${y.slice(2)}` })
      const next = await api.get<Position[]>(`/months/${id}/positions`)
      setPositions(next)
      await refreshAutoSendPdf(next)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (loading) return <div style={s.center}>{t('loading')}</div>
  if (!month) return <div style={s.center}>{t('monthNotFound')}</div>

  const total = positions.reduce((sum, p) => sum + p.gesamt, 0)
  const firma = profile?.firma || 'Norm Services GmbH'

  // Tarih seçici yalnızca bu ayın günlerini gösterir; DD.MM.YY <-> YYYY-MM-DD
  const mm = String(month.month).padStart(2, '0')
  const monthMin = `${month.year}-${mm}-01`
  const monthMax = `${month.year}-${mm}-${new Date(month.year, month.month, 0).getDate()}`
  const toIso = (d: string) => `20${d.slice(6, 8)}-${d.slice(3, 5)}-${d.slice(0, 2)}`

  // Son seyahat bitmeden PDF/mail çıkarılamaz — henüz yaşanmamış seyahat beyan edilmez
  const lockedUntil = documentLockedUntil(positions, now)
  const lockedMsg = lockedUntil
    ? t('docLockedHint').replace('{date}', lockedUntil.date).replace('{time}', lockedUntil.time)
    : ''

  // Otomatik gönderim zamanı = son seyahatin bitişi + bekleme süresi (Berlin saati)
  const tripEnd = lastTripEnd(positions)
  const autoOn = !!month.autoSend?.enabled
  const sendKey = tripEnd ? addMinutesToKey(tripEnd.key, delay) : ''
  const sendAt = sendKey ? splitKey(sendKey) : null
  const autoDue = !!sendKey && berlinNowKey(now) >= sendKey
  const fillAuto = (tpl: string) => !tripEnd || !sendAt ? tpl : tpl
    .replace('{date}', sendAt.date).replace('{time}', sendAt.time)
    .replace('{end}', `${tripEnd.date} ${tripEnd.time}`).replace('{delay}', String(delay))

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>{monthNames[month.month - 1]} {month.year}</h1>
          <span style={s.person}>{month.personName} · {firma}</span>
        </div>
        {month.mailSent && (
          <span style={s.mailSentBadge}>{t('mailSentBadge')}</span>
        )}
      </div>

      {showImport && (
        <ExcelImportModal onClose={() => setShowImport(false)} onImport={handleImport} />
      )}

      {aiNote && (
        <div style={{
          margin: '0 0 12px', padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
          background: aiNote.ok ? '#f0fff4' : '#fffaf0',
          color: aiNote.ok ? '#22543d' : '#7b341e',
          border: `1px solid ${aiNote.ok ? '#c6f6d5' : '#feebc8'}`,
        }}>
          {aiNote.ok
            ? <><b>✨ {t('aiGenerated')}</b>{aiNote.msg ? ` — ${aiNote.msg}` : ''}</>
            : <><b>{t('aiFailed')}</b> {aiNote.msg}</>}
        </div>
      )}

      {/* ── Buton Grubu ── */}
      <div style={s.btnGroup}>
        <button style={{ ...s.btn, ...(shuffling ? s.btnDisabled : {}) }} onClick={() => shuffle(false)} disabled={shuffling}>
          <ShuffleIcon /> {shuffling ? t('shuffling') : t('shuffleBtn')}
        </button>
        <div style={s.btnDivider} />
        <button style={{ ...s.btn, ...(shuffling ? s.btnDisabled : {}) }}
          onClick={() => shuffle(true)} disabled={shuffling} title={t('aiShuffleHint')}>
          ✨ {shuffling ? t('aiShuffling') : t('aiShuffleBtn')}
        </button>
        <div style={s.btnDivider} />
        <button style={s.btn} onClick={() => setShowImport(true)}>
          <UploadIcon /> Excel İçe Aktar
        </button>
        {positions.length > 0 && (
          <>
            <div style={s.btnDivider} />
            <button style={{ ...s.btn, ...(lockedUntil ? s.btnDisabled : {}) }}
              onClick={() => { if (!lockedUntil) exportToPdf(month!, positions, firma) }}
              disabled={!!lockedUntil} title={lockedMsg}>
              <PdfIcon /> {t('pdfBtn')}
            </button>
            <div style={s.btnDivider} />
            <button style={{ ...s.btn, ...(sending || lockedUntil ? s.btnDisabled : {}) }}
              onClick={sendEmail} disabled={sending || !!lockedUntil} title={lockedMsg}>
              <MailIcon /> {sending ? t('sending') : t('sendMail')}
            </button>
          </>
        )}
      </div>

      {lockedUntil && !month.mailSent && (
        <div style={s.lockNote}>
          <b>🔒 {t('docLockedTitle')}</b> {lockedMsg}
        </div>
      )}

      {positions.length > 0 && !month.mailSent && tripEnd && (
        <div style={s.autoCard}>
          <label style={s.autoRow}>
            <input type="checkbox" checked={autoOn}
              onChange={e => syncAutoSend(e.target.checked, delay)} />
            <b>{t('autoSendLabel')}</b>
          </label>
          <div style={s.autoRow}>
            <span>{t('autoSendDelay')}</span>
            <input type="range" min={15} max={60} step={15} value={delay}
              onChange={e => {
                const v = Number(e.target.value)
                setDelay(v)
                syncAutoSend(autoOn, v)
              }} />
            <b>{delay} {t('minutesShort')}</b>
          </div>
          <div style={{ color: autoOn ? '#22543d' : '#64748b' }}>
            {autoOn
              ? (autoDue ? t('autoSendDue') : fillAuto(t('autoSendWillSend')))
              : fillAuto(t('autoSendOffHint'))}
          </div>
          {month.autoSend?.lastError && (
            <div style={{ color: '#c53030' }}>{t('autoSendError')} {month.autoSend.lastError}</div>
          )}
        </div>
      )}

      {/* ── Bu ayın gönderim geçmişi ── */}
      {mailLog.length > 0 && (
        <div style={{ ...s.card, padding: '18px 22px', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#2d3748', margin: '0 0 4px' }}>
            {t('monthMailTitle')}
          </h3>
          <p style={{ fontSize: 12, color: '#718096', margin: '0 0 14px' }}>{t('monthMailNote')}</p>

          {mailLog.map(l => (
            <div key={l._id} style={{
              padding: '10px 0', borderTop: '1px solid #edf2f7', fontSize: 13,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color: l.ok ? '#2f855a' : '#c53030', fontWeight: 700 }}>
                  {l.ok ? '✓' : '✗'}
                </span>
                <span style={{ color: '#4a5568' }}>{new Date(l.createdAt).toLocaleString()}</span>
                <span style={{ color: '#718096' }}>·</span>
                <span style={{ color: '#2d3748' }}>{l.fromAddress}</span>
                {l.accountLabel && <span style={{ color: '#a0aec0', fontSize: 12 }}>({l.accountLabel})</span>}
              </div>

              {/* Adres bazında kabul/ret — asıl sorulan bu */}
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(l.accepted?.length ? l.accepted : (l.ok ? l.to : [])).map(a => (
                  <span key={`a-${a}`} style={{
                    background: '#c6f6d5', color: '#22543d', borderRadius: 5,
                    padding: '2px 8px', fontSize: 12,
                  }}>✓ {a} — {t('monthMailAccepted')}</span>
                ))}
                {(l.rejected ?? []).map(r => (
                  <span key={`r-${r}`} style={{
                    background: '#fed7d7', color: '#742a2a', borderRadius: 5,
                    padding: '2px 8px', fontSize: 12, fontWeight: 600,
                  }}>✗ {r} — {t('monthMailRejected')}</span>
                ))}
                {!l.ok && !(l.rejected?.length) && l.to.map(a => (
                  <span key={`f-${a}`} style={{
                    background: '#fed7d7', color: '#742a2a', borderRadius: 5,
                    padding: '2px 8px', fontSize: 12,
                  }}>✗ {a}</span>
                ))}
              </div>

              {!l.ok && l.error && (
                <div style={{ marginTop: 5, fontSize: 12, color: '#c53030' }}>{l.error}</div>
              )}
              {l.ok && (
                <div style={{ marginTop: 5, fontSize: 11, color: '#718096' }}>
                  {l.savedToSent
                    ? `✓ ${t('mailLogSaved')}${l.sentFolder ? ` (${l.sentFolder})` : ''}`
                    : l.saveError ? `⚠ ${t('mailLogNotSaved')}: ${l.saveError}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tablo ── */}
      {positions.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <p style={s.emptyTitle}>{t('noPositions')}</p>
          <p style={s.emptyHint}>{t('noPositionsHint')}</p>
        </div>
      ) : (
        <div style={s.card}>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Datum','Start','Ende','Std.','Zielort','Reisezweck','Verpfl.','Übern.','km','Fahrk.','Gesamt'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={p._id} style={{
                    background: p.isOvernight ? '#fffbeb' : i % 2 === 0 ? '#fff' : '#fafafa',
                  }}>
                    <td style={s.td}>
                      {month.mailSent ? (
                        <span style={s.dateTag} title={t('dateLockedHint')}>🔒 {p.date}</span>
                      ) : (
                        <input type="date" style={s.dateInput}
                          value={toIso(p.date)} min={monthMin} max={monthMax}
                          onChange={e => updateDate(p._id, e.target.value)} />
                      )}
                    </td>
                    <td style={s.tdC}>{p.startTime}</td>
                    <td style={s.tdC}>{p.endTime}</td>
                    <td style={s.tdC}>{p.totalHours}</td>
                    <td style={{ ...s.td, maxWidth: 180 }}>
                      <span style={s.destText}>{p.destination}</span>
                    </td>
                    <td style={s.td}>
                      <select style={s.select} value={p.reisezweck}
                        onChange={e => updateReisezweck(p._id, e.target.value)}>
                        {REISEZWECK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={s.tdR}>{p.verpflegungPauschal > 0 ? `${p.verpflegungPauschal} €` : '—'}</td>
                    <td style={s.tdR}>{p.uebernachtungPauschal > 0 ? `${p.uebernachtungPauschal} €` : '—'}</td>
                    <td style={s.tdC}>{p.km}</td>
                    <td style={s.tdR}>{p.fahrkostenTatsaechlich.toFixed(2).replace('.', ',')} €</td>
                    <td style={s.tdTotal}>{p.gesamt.toFixed(2).replace('.', ',')} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={10} style={s.footLabel}>Gesamt</td>
                  <td style={s.footTotal}>{total.toFixed(2).replace('.', ',')} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Alt Bilgi ── */}
      {positions.length > 0 && (
        <div style={s.infoRow}>
          {/* Geceleme açıklaması */}
          <div style={s.legendItem}>
            <span style={s.legendDot} />
            <span style={s.legendRule}>{t('legendRule')}</span>
          </div>

          {/* Hesaplama tablosu */}
          <div style={s.calcCard}>
            <div style={s.calcTitle}>{t('calcTitle')}</div>
            <table style={s.calcTable}>
              <thead>
                <tr>
                  <th style={s.calcTh}>{t('calcStep')}</th>
                  <th style={s.calcTh}>{t('calcCalc')}</th>
                </tr>
              </thead>
              <tbody>
                {translations[lang].calcRows.map(([step, calc]) => (
                  <tr key={step}>
                    <td style={s.calcTdStep}>{step}</td>
                    <td style={s.calcTdCalc}>{calc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
}
function ShuffleIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
}
function PdfIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
}
function MailIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: '0 0 4px', fontSize: 20, color: '#0f172a', fontWeight: 700 },
  person: { fontSize: 13, color: '#64748b' },
  mailSentBadge: { background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },

  btnGroup: {
    display: 'inline-flex', alignItems: 'center',
    background: '#fff', border: '1.5px solid #e2e8f0',
    borderRadius: 10, overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    alignSelf: 'flex-start',
  },
  btn: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 18px', border: 'none', background: 'transparent',
    color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  autoCard: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderRadius: 10, fontSize: 13, background: '#fff', border: '1.5px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' },
  autoRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', color: '#374151', cursor: 'pointer' },
  lockNote: { padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5, background: '#fffaf0', color: '#7b341e', border: '1px solid #feebc8' },
  btnDivider: { width: 1, height: 28, background: '#e2e8f0', flexShrink: 0 },

  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 12px', background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', textAlign: 'left' } as React.CSSProperties,
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#1e293b', verticalAlign: 'middle' },
  tdC: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#475569', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' } as React.CSSProperties,
  tdR: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#475569', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'middle' } as React.CSSProperties,
  tdTotal: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', verticalAlign: 'middle' } as React.CSSProperties,

  dateTag: { background: '#f1f5f9', color: '#475569', borderRadius: 5, padding: '2px 7px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  dateInput: { border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc' },
  destText: { fontSize: 12, color: '#475569' },
  select: { border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px', fontSize: 12, color: '#374151', background: '#f8fafc' },

  footLabel: { padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: 13, background: '#f8fafc' } as React.CSSProperties,
  footTotal: { padding: '12px 12px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#059669', background: '#f8fafc', whiteSpace: 'nowrap' } as React.CSSProperties,

  empty: { textAlign: 'center', padding: '64px 16px', color: '#94a3b8' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: '#475569', margin: '0 0 6px' },
  emptyHint: { fontSize: 13, color: '#94a3b8', margin: 0 },

  infoRow: { display: 'flex', flexDirection: 'column', gap: 12 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' },
  legendDot: { width: 12, height: 12, borderRadius: 2, background: '#fef9c3', border: '1px solid #fde047', display: 'inline-block', flexShrink: 0 },
  legendRule: { fontSize: 12, color: '#94a3b8' },

  calcCard: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' },
  calcTitle: { padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' } as React.CSSProperties,
  calcTable: { width: '100%', borderCollapse: 'collapse' },
  calcTh: { padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' } as React.CSSProperties,
  calcTdStep: { padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#374151', borderBottom: '1px solid #f8fafc', whiteSpace: 'nowrap', width: 200 } as React.CSSProperties,
  calcTdCalc: { padding: '10px 16px', fontSize: 13, color: '#6b7280', borderBottom: '1px solid #f8fafc', fontFamily: 'monospace' },
}
