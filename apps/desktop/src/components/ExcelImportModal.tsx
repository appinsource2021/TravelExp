import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import type { Position } from '../types/travel'

// ── Sistem alanları ──────────────────────────────────────────────────────────
const SYSTEM_FIELDS: { key: keyof ImportRow; label: string; required: boolean }[] = [
  { key: 'date',                  label: 'Tarih (DD.MM.YY)',      required: true  },
  { key: 'startTime',             label: 'Başlangıç (HH:MM)',     required: true  },
  { key: 'endTime',               label: 'Bitiş (HH:MM)',         required: true  },
  { key: 'totalHours',            label: 'Toplam Saat',           required: false },
  { key: 'destination',           label: 'Zielort',               required: true  },
  { key: 'reisezweck',            label: 'Reisezweck',            required: false },
  { key: 'verpflegungPauschal',   label: 'Verpflegung Pauschal',  required: false },
  { key: 'uebernachtungPauschal', label: 'Übernachtung Pauschal', required: false },
  { key: 'km',                    label: 'KM',                    required: true  },
  { key: 'kmPrice',               label: 'KM Preis',              required: false },
  { key: 'fahrkostenTatsaechlich',label: 'Fahrkosten',            required: false },
  { key: 'gesamt',                label: 'Gesamt',                required: true  },
]

// Otomatik eşleştirme anahtar kelimeleri
const AUTO_MATCH: Record<keyof ImportRow, string[]> = {
  date:                   ['datum', 'date', 'tarih'],
  startTime:              ['start', 'von', 'begin', 'uhrzeit-start', 'uhrzeitstart'],
  endTime:                ['end', 'bis', 'ende', 'uhrzeit-ende', 'uhrzeitende'],
  totalHours:             ['stunden', 'hours', 'gesamt', 'total', 'saat'],
  destination:            ['zielort', 'destination', 'adresse', 'ort'],
  reisezweck:             ['reisezweck', 'zweck', 'purpose'],
  verpflegungPauschal:    ['verpflegung', 'pauschal', 'verpflegungskosten'],
  uebernachtungPauschal:  ['übernachtung', 'ubernachtung', 'overnight'],
  km:                     ['km', 'kilometer', 'entfernung'],
  kmPrice:                ['km/prise', 'kmprise', 'preis', 'price', 'prise'],
  fahrkostenTatsaechlich: ['fahrkosten', 'fahrtkosten', 'tatsächl', 'tatsachlich'],
  gesamt:                 ['gesamt', 'total', 'summe', 'toplam'],
}

type ImportRow = Omit<Position, '_id' | 'monthId' | 'sortOrder' | 'isOvernight'>
type Mapping = Record<keyof ImportRow, string> // systemField -> excelColumn

function autoMap(excelCols: string[]): Mapping {
  const mapping = {} as Mapping
  for (const field of SYSTEM_FIELDS) {
    const keywords = AUTO_MATCH[field.key]
    const found = excelCols.find(col =>
      keywords.some(kw => col.toLowerCase().replace(/[^a-züöäß0-9]/g, '').includes(kw.replace(/[^a-züöäß0-9]/g, '')))
    )
    mapping[field.key] = found ?? ''
  }
  return mapping
}

function parseCell(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'number') {
    // Excel tarih sayısı mı?
    if (val > 40000 && val < 60000) {
      const d = XLSX.SSF.parse_date_code(val)
      if (d) {
        const day   = String(d.d).padStart(2, '0')
        const month = String(d.m).padStart(2, '0')
        const year  = String(d.y).slice(-2)
        return `${day}.${month}.${year}`
      }
    }
    return String(val)
  }
  return String(val).trim()
}

function buildRows(rawRows: Record<string, unknown>[], mapping: Mapping): ImportRow[] {
  return rawRows
    .map((raw) => {
      const get = (field: keyof ImportRow) => parseCell(raw[mapping[field]])
      const km              = parseFloat(get('km'))              || 0
      const kmPrice         = parseFloat(get('kmPrice'))         || 0.30
      const verpflegung     = parseFloat(get('verpflegungPauschal'))   || 14
      const uebernachtung   = parseFloat(get('uebernachtungPauschal')) || 0
      const fahrkosten      = parseFloat(get('fahrkostenTatsaechlich')) || parseFloat((km * kmPrice).toFixed(2))
      const gesamt          = parseFloat(get('gesamt').replace(/[€\s]/g, '').replace(',', '.')) ||
                              parseFloat((fahrkosten + verpflegung + uebernachtung).toFixed(2))

      return {
        date:                  get('date'),
        startTime:             get('startTime'),
        endTime:               get('endTime'),
        totalHours:            get('totalHours'),
        destination:           get('destination'),
        reisezweck:            get('reisezweck') || 'Business',
        verpflegungPauschal:   verpflegung,
        uebernachtungPauschal: uebernachtung,
        km,
        kmPrice,
        fahrkostenTatsaechlich: fahrkosten,
        gesamt,
      } satisfies ImportRow
    })
    .filter(r => r.date && r.destination)
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void
  onImport: (rows: ImportRow[]) => Promise<void>
}

// ── Component ────────────────────────────────────────────────────────────────
export function ExcelImportModal({ onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep]       = useState<'upload' | 'mapping' | 'preview'>('upload')
  const [excelCols, setExcelCols]   = useState<string[]>([])
  const [rawRows, setRawRows]       = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping]       = useState<Mapping>({} as Mapping)
  const [rows, setRows]             = useState<ImportRow[]>([])
  const [importing, setImporting]   = useState(false)
  const [error, setError]           = useState('')

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (data.length === 0) { setError('Excel boş görünüyor.'); return }
        const cols = Object.keys(data[0])
        setExcelCols(cols)
        setRawRows(data)
        setMapping(autoMap(cols))
        setStep('mapping')
        setError('')
      } catch {
        setError('Excel dosyası okunamadı.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const goPreview = () => {
    const built = buildRows(rawRows, mapping)
    if (built.length === 0) { setError('Eşleştirme sonrası geçerli satır bulunamadı.'); return }
    setRows(built)
    setStep('preview')
    setError('')
  }

  const updateCell = (i: number, field: keyof ImportRow, val: string) => {
    setRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, [field]: field === 'km' || field === 'kmPrice' || field === 'gesamt' ||
        field === 'verpflegungPauschal' || field === 'uebernachtungPauschal' || field === 'fahrkostenTatsaechlich'
        ? parseFloat(val) || 0 : val } : r
    ))
  }

  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const handleImport = async () => {
    setImporting(true)
    try {
      await onImport(rows)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'İçe aktarma hatası')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>
            {step === 'upload'  && 'Excel İçe Aktar'}
            {step === 'mapping' && `Kolon Eşleştirme — ${rawRows.length} satır`}
            {step === 'preview' && `Önizleme — ${rows.length} satır`}
          </span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* ── Adım 1: Upload ── */}
        {step === 'upload' && (
          <div style={s.dropzone} onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div style={s.dropIcon}>📂</div>
            <p style={s.dropText}>Excel dosyasını sürükleyin veya tıklayın</p>
            <p style={s.dropHint}>.xlsx / .xls / .csv</p>
          </div>
        )}

        {/* ── Adım 2: Kolon Eşleştirme ── */}
        {step === 'mapping' && (
          <>
            <div style={s.mappingGrid}>
              <div style={s.mappingHead}>Sistem Alanı</div>
              <div style={s.mappingHead}>Excel Kolonu</div>
              {SYSTEM_FIELDS.map(f => (
                <>
                  <div key={f.key + '_label'} style={s.mappingLabel}>
                    {f.label}{f.required && <span style={s.req}> *</span>}
                  </div>
                  <select key={f.key + '_sel'} style={s.mappingSelect}
                    value={mapping[f.key] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}>
                    <option value=''>— Yok say —</option>
                    {excelCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </>
              ))}
            </div>
            <div style={s.footer}>
              <button style={s.btnSecondary} onClick={() => setStep('upload')}>← Geri</button>
              <button style={s.btnPrimary} onClick={goPreview}>Önizleme →</button>
            </div>
          </>
        )}

        {/* ── Adım 3: Preview & Edit ── */}
        {step === 'preview' && (
          <>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {(['date','startTime','endTime','destination','reisezweck','km','kmPrice','verpflegungPauschal','uebernachtungPauschal','fahrkostenTatsaechlich','gesamt'] as (keyof ImportRow)[]).map(f => (
                      <th key={f} style={s.th}>{SYSTEM_FIELDS.find(sf => sf.key === f)?.label ?? f}</th>
                    ))}
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                      {(['date','startTime','endTime','destination','reisezweck','km','kmPrice','verpflegungPauschal','uebernachtungPauschal','fahrkostenTatsaechlich','gesamt'] as (keyof ImportRow)[]).map(f => (
                        <td key={f} style={s.td}>
                          <input style={s.cellInput} value={String(row[f])}
                            onChange={e => updateCell(i, f, e.target.value)} />
                        </td>
                      ))}
                      <td style={s.td}>
                        <button style={s.removeBtn} onClick={() => removeRow(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={s.footer}>
              <button style={s.btnSecondary} onClick={() => setStep('mapping')}>← Geri</button>
              <button style={{ ...s.btnPrimary, ...(importing ? s.btnDisabled : {}) }}
                onClick={handleImport} disabled={importing}>
                {importing ? 'Aktarılıyor...' : `İçe Aktar (${rows.length} satır)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  backdrop:     { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal:        { background:'#fff', borderRadius:12, width:'min(96vw, 1100px)', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  header:       { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #e2e8f0' },
  title:        { fontWeight:700, fontSize:16, color:'#1a202c' },
  closeBtn:     { background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#64748b', padding:'0 4px' },
  error:        { background:'#fff5f5', color:'#c53030', fontSize:13, padding:'8px 20px', borderBottom:'1px solid #fed7d7' },
  dropzone:     { margin:32, border:'2px dashed #cbd5e0', borderRadius:10, padding:'48px 24px', textAlign:'center', cursor:'pointer', transition:'border-color .2s' },
  dropIcon:     { fontSize:40, marginBottom:12 },
  dropText:     { fontSize:15, fontWeight:600, color:'#2d3748', margin:'0 0 6px' },
  dropHint:     { fontSize:12, color:'#94a3b8', margin:0 },
  mappingGrid:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', padding:'16px 20px', overflowY:'auto', maxHeight:'60vh' },
  mappingHead:  { fontWeight:700, fontSize:12, color:'#64748b', textTransform:'uppercase', padding:'4px 0', borderBottom:'1px solid #e2e8f0', marginBottom:4 },
  mappingLabel: { display:'flex', alignItems:'center', fontSize:13, color:'#374151', padding:'4px 0' },
  req:          { color:'#e53e3e' },
  mappingSelect:{ border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 8px', fontSize:13, color:'#374151', background:'#f8fafc' },
  tableWrap:    { overflowX:'auto', overflowY:'auto', maxHeight:'60vh', padding:'0 20px' },
  table:        { borderCollapse:'collapse', width:'100%', fontSize:12 },
  th:           { background:'#f8fafc', padding:'8px 6px', textAlign:'left', fontWeight:600, color:'#64748b', whiteSpace:'nowrap', borderBottom:'2px solid #e2e8f0', position:'sticky', top:0 },
  td:           { padding:'2px 4px', borderBottom:'1px solid #f1f5f9' },
  trEven:       { background:'#fff' },
  trOdd:        { background:'#f8fafc' },
  cellInput:    { border:'1px solid transparent', borderRadius:4, padding:'3px 6px', fontSize:12, width:'100%', minWidth:60, background:'transparent', outline:'none' },
  removeBtn:    { background:'none', border:'none', cursor:'pointer', color:'#e53e3e', fontSize:14, padding:'0 4px' },
  footer:       { display:'flex', justifyContent:'flex-end', gap:10, padding:'12px 20px', borderTop:'1px solid #e2e8f0' },
  btnPrimary:   { background:'#3b82f6', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontWeight:600, fontSize:14, cursor:'pointer' },
  btnSecondary: { background:'#f1f5f9', color:'#374151', border:'none', borderRadius:8, padding:'8px 20px', fontWeight:600, fontSize:14, cursor:'pointer' },
  btnDisabled:  { opacity:0.5, cursor:'not-allowed' },
}
