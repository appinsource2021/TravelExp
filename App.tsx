import { useEffect, useState } from 'react'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { ScannerScreen } from './src/screens/ScannerScreen'
import { EmailScreen } from './src/screens/EmailScreen'
import { VerifyScreen } from './src/screens/VerifyScreen'
import { RegisterScreen } from './src/screens/RegisterScreen'
import { useDeviceUUID } from './src/hooks/useDeviceUUID'
import type { AppScreen } from './src/types'

export default function App() {
  const deviceUUID = useDeviceUUID()
  const [screen, setScreen] = useState<AppScreen>('scanner')
  // QR oturumu ve doğrulanan e-posta, adımlar arasında taşınır
  const [socketId, setSocketId] = useState('')
  const [email, setEmail] = useState('')

  // Sonuç ekranı 2sn sonra otomatik scanner'a döner
  useEffect(() => {
    if (screen === 'success' || screen === 'error') {
      const t = setTimeout(() => setScreen('scanner'), 2000)
      return () => clearTimeout(t)
    }
  }, [screen])

  const renderScreen = () => {
    switch (screen) {
      case 'scanner':
        return <ScannerScreen deviceUUID={deviceUUID} onNavigate={setScreen} onSocketId={setSocketId} />
      case 'email':
        return <EmailScreen deviceUUID={deviceUUID} onNavigate={setScreen} onEmailSent={setEmail} />
      case 'verify':
        return <VerifyScreen deviceUUID={deviceUUID} email={email} socketId={socketId} onNavigate={setScreen} />
      case 'register':
        return <RegisterScreen deviceUUID={deviceUUID} email={email} socketId={socketId} onNavigate={setScreen} />
      case 'success':
        return (
          <View style={styles.center}>
            <Text style={styles.successText}>✓ Giriş başarılı</Text>
            <Text style={styles.sub}>Tarayıcıya giriş yapıldı</Text>
          </View>
        )
      case 'error':
        return (
          <View style={styles.center}>
            <Text style={styles.errorText}>✗ Başarısız</Text>
            <TouchableOpacity onPress={() => setScreen('scanner')}>
              <Text style={styles.retry}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        )
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      {renderScreen()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  successText: { fontSize: 26, fontWeight: '700', color: '#38a169' },
  errorText: { fontSize: 26, fontWeight: '700', color: '#e53e3e' },
  sub: { fontSize: 14, color: '#718096' },
  retry: { color: '#3182ce', fontSize: 16, marginTop: 8 },
})
