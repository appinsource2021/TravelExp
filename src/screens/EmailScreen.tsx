import { useState } from 'react'
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, Alert, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import type { AppScreen } from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface Props {
  deviceUUID: string
  onNavigate: (screen: AppScreen) => void
  onEmailSent: (email: string) => void
}

export function EmailScreen({ deviceUUID, onNavigate, onEmailSent }: Props) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    const value = email.trim().toLowerCase()
    if (!value.includes('@') || !value.includes('.')) {
      Alert.alert('Geçersiz E-posta', 'Lütfen geçerli bir e-posta adresi girin.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/email/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, deviceUUID }),
      })
      const json = await res.json()
      if (res.ok) {
        onEmailSent(value)
        onNavigate('verify')
      } else {
        Alert.alert('Hata', json.error ?? 'Kod gönderilemedi.')
      }
    } catch {
      Alert.alert('Bağlantı Hatası', 'Sunucuya ulaşılamadı.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />

      <View style={styles.body}>
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>✉</Text>
          </View>
          <Text style={styles.title}>E-posta Adresiniz</Text>
          <Text style={styles.sub}>Hesabınızı doğrulamak için kod göndereceğiz</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>E-posta</Text>
          <TextInput
            style={styles.input}
            placeholder="ornek@firma.com"
            placeholderTextColor="#475569"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Kod Gönder</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => onNavigate('scanner')} disabled={loading}>
            <Text style={styles.cancel}>Vazgeç</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Daha önce kayıt olduysanız aynı e-postayı girin — hesabınız bu telefona taşınır.
        </Text>
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
  label: { fontSize: 13, color: '#94a3b8', marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: '#0b1220',
    borderWidth: 1, borderColor: '#1e293b',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#f1f5f9', fontSize: 16,
  },
  btn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 16 },
  hint: { fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 24, lineHeight: 18 },
})
