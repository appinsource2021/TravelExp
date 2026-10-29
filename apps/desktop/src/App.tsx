import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AppContext } from './context/AppContext'
import { LangProvider, useLang } from './context/LangContext'
import { Layout } from './components/Layout'
import { QRScreen } from './components/QRScreen'
import { MonthListPage } from './pages/MonthListPage'
import { MonthDetailPage } from './pages/MonthDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'

function AuthGate() {
  const { status, socketId, user, logout } = useAuth()
  const { t } = useLang()

  if (status === 'authenticated') {
    return (
      <AppContext.Provider value={{ user, logout }}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<MonthListPage />} />
              <Route path="/month/:id" element={<MonthDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppContext.Provider>
    )
  }

  if (status === 'waiting' && socketId) {
    return <QRScreen socketId={socketId} />
  }

  if (status === 'rejected' && socketId) {
    return (
      <div style={centered}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#e53e3e', fontWeight: 600, marginBottom: 8 }}>{t('deviceNotRegistered')}</p>
          <p style={{ color: '#718096', fontSize: 14, marginBottom: 24 }}>{t('deviceNotRegisteredHint')}</p>
          <QRScreen socketId={socketId} />
        </div>
      </div>
    )
  }

  return (
    <div style={centered}>
      <p style={{ color: '#64748b', fontSize: 15 }}>{t('connecting')}</p>
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthGate />
    </LangProvider>
  )
}

const centered: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
}
