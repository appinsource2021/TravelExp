import { useState } from 'react'
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, Alert, ScrollView, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native'
import type { AppScreen } from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api'

interface Props {
  deviceUUID: string
  email: string
  socketId: string
  onNavigate: (screen: AppScreen) => void
}

export function RegisterScreen({ deviceUUID, email, socketId, onNavigate }: Props) {
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name.trim() || !surname.trim() || !dob.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm alanları doldurun.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceUUID, email, socketId, name: name.trim(), surname: surname.trim(), dob: dob.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        // socketId hâlâ geçerliyse sunucu oturumu da açtı
        if (json.loggedIn) {
          onNavigate('success')
        } else {
          Alert.alert('Kayıt Başarılı', 'Hesabınız oluşturuldu. Şimdi QR kodu tarayabilirsiniz.', [
            { text: 'Devam', onPress: () => onNavigate('scanner') },
          ])
        }
      } else {
        Alert.alert('Hata', json.error ?? 'Kayıt başarısız, tekrar deneyin.')
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>✈</Text>
          </View>
          <Text style={styles.appName}>TravelExp Authenticator</Text>
          <Text style={styles.appSub}>{email}</Text>
        </View>

        {/* Form kartı */}
        <View style={styles.card}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ad</Text>
            <TextInput
              style={styles.input}
              placeholder="Adınız"
              placeholderTextColor="#475569"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Soyad</Text>
            <TextInput
              style={styles.input}
              placeholder="Soyadınız"
              placeholderTextColor="#475569"
              value={surname}
              onChangeText={setSurname}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Doğum Tarihi</Text>
            <TextInput
              style={styles.input}
              placeholder="GG.AA.YYYY"
              placeholderTextColor="#475569"
              value={dob}
              onChangeText={setDob}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{loading ? 'Kaydediliyor...' : 'Kayıt Ol'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => onNavigate('scanner')}>
            <Text style={styles.backText}>← Geri dön</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Cihaz ID: {deviceUUID.slice(0, 8)}...</Text>

        <View style={styles.branding}>
          <Text style={styles.brandApp}>app</Text>
          <Text style={styles.brandIn}>in</Text>
          <Text style={styles.brandSource}>source</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080d14' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },

  logoArea: { alignItems: 'center', marginBottom: 36 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#3b82f6', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
  },
  logoEmoji: { fontSize: 30 },
  appName: { fontSize: 20, fontWeight: '800', color: '#f1f5f9', textAlign: 'center' },
  appSub: { fontSize: 13, color: '#64748b', marginTop: 4 },

  card: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 16,
  },

  fieldGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#334155',
  },

  divider: { height: 1, backgroundColor: '#1e293b' },

  btn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#3b82f6', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  backBtn: { alignItems: 'center', paddingVertical: 4 },
  backText: { color: '#475569', fontSize: 14 },

  footer: { marginTop: 16, fontSize: 11, color: '#334155' },

  branding: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  brandApp: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  brandIn: { fontSize: 16, fontWeight: '800', color: '#7dd3fc', letterSpacing: 0.3 },
  brandSource: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
})
