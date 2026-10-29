import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

interface Props {
  socketId: string
}

export function QRScreen({ socketId }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Başarılı olursa oturum QR'daki gibi soket üzerinden gelir (auth:success)
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/auth/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), socketId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Giriş başarısız')
      }
    } catch {
      setError('Sunucuya ulaşılamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.container}>
        <h2>TravelExp Authenticator</h2>
        <h5>Giriş yapmak için QR kodu tarayın</h5>
        <div style={styles.qrWrapper}>
            <QRCodeSVG value={socketId} size={220} />
        </div>
      <p style={styles.hint}>Mobil uygulamayı açın ve kodu okutun</p>
      <form onSubmit={submitCode} style={styles.codeForm}>
        <p style={styles.hint}>veya giriş koduyla girin</p>
        <div style={styles.codeRow}>
          <input
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Giriş kodu"
            autoComplete="current-password"
            style={styles.codeInput}
          />
          <button type="submit" disabled={busy || !code.trim()} style={styles.codeButton}>
            {busy ? '…' : 'Giriş'}
          </button>
        </div>
        {error && <p style={styles.codeError}>{error}</p>}
      </form>
      <div style={styles.appinsource_wrapper}>
        <p style={styles.app_source}>app</p>
        <p style={styles.in}>in</p>
        <p style={styles.app_source}>source</p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 24,
  },
  qrWrapper: {
    padding: 24,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
  },
  hint: {
    color: '#888',
    fontSize: 14,
  },
  codeForm: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  codeRow: {
    display: 'flex',
    gap: 8,
  },
  codeInput: {
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #cbd5e0',
    borderRadius: 8,
    width: 180,
  },
  codeButton: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    background: '#222df4',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  codeError: {
    color: '#e53e3e',
    fontSize: 13,
    margin: 0,
  },
  app_source: {
    color: '#4e4e4e',
    fontSize: 14,
    fontWeight: 'bold'
  },
  in: {
    color: '#222df4',
    fontSize: 14,
    fontWeight: 'bold'
  },
    appinsource_wrapper: {
    display: 'flex',
    position: 'absolute',
    bottom: '20px'
  },
  
}
