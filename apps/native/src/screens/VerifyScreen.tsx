import { useState } from 'react'
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, Alert, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import type { AppScreen } from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface Props {
  deviceUUID: string
  email: string
  socketId: string
  onNavigate: (screen: AppScreen) => void
}

export function VerifyScreen({ deviceUUID, email, socketId, onNavigate }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const handleVerify = async () => {
    const value = code.trim()
    if (value.length !== 6) {
      Alert.alert('Eksik Kod', 'Lütfen e-postanıza gelen 6 haneli kodu girin.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: value, deviceUUID, socketId }),
      })
      const json = await res.json()

      if (!res.ok) {
        Alert.alert('Doğrulanamadı', json.error ?? 'Kod hatalı.')
        return
      }

      if (json.registered) {
        // Hesap bulundu — veriler bu telefona taşındı, oturum açıldı
        onNavigate('success')
      } else {
        // E-posta yeni — ad/soyad/doğum tarihi istenecek
        onNavigate('register')
      }
    } catch {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      const res = await fetch(`${API_URL}/auth/email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceUUID }),
      })
      if (res.ok) {
        setCode('')
        Alert.alert('Gönderildi', 'Yeni kod e-postanıza gönderildi.')
      } else {
        const json = await res.json()
        Alert.alert('Hata', json.error ?? 'Kod gönderilemedi.')
      }
    } catch {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamadı.')
    } finally {
      setResending(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />

      <View style={styles.body}>
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>⊞</Text>
          </View>
          <Text style={styles.title}>Doğrulama Kodu</Text>
          <Text style={styles.sub}>{email} adresine gönderildi</Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor="#334155"
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleVerify}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Doğrula</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={loading || resending}>
            <Text style={styles.resend}>{resending ? 'Gönderiliyor...' : 'Kodu tekrar gönder'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => onNavigate('email')} disabled={loading}>
            <Text style={styles.cancel}>E-postayı değiştir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Kod 10 dakika geçerlidir.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080d14' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#3b82f6', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
  },
  logoEmoji: { fontSize: 28, color: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: '#f1f5f9' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center' },

  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#1e293b',
  },
  codeInput: {
    backgroundColor: '#0b1220',
    borderWidth: 1, borderColor: '#1e293b',
    borderRadius: 12, paddingVertical: 18,
    color: '#f1f5f9', fontSize: 32, fontWeight: '700',
    textAlign: 'center', letterSpacing: 12,
  },
  btn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resend: { color: '#38bdf8', fontSize: 14, textAlign: 'center', marginTop: 18 },
  cancel: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 12 },
  hint: { fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 24 },
})
