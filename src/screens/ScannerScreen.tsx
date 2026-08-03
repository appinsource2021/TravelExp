import { useState, useEffect, useRef } from 'react'
import {
  StyleSheet, Text, View, TouchableOpacity,
  Alert, Animated, Dimensions, StatusBar,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import type { AppScreen } from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api'
const { width, height } = Dimensions.get('window')
const FRAME_SIZE = width * 0.68
const FRAME_LEFT = (width - FRAME_SIZE) / 2
const FRAME_RIGHT = FRAME_LEFT + FRAME_SIZE
const FRAME_TOP = (height - FRAME_SIZE) / 2
const FRAME_BOTTOM = FRAME_TOP + FRAME_SIZE
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  deviceUUID: string
  onNavigate: (screen: AppScreen) => void
  onSocketId: (socketId: string) => void
}

export function ScannerScreen({ deviceUUID, onNavigate, onSocketId }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(false)
  const scanLine = useRef(new Animated.Value(0)).current
  const btnScale = useRef(new Animated.Value(1)).current

  // Tarama çizgisi animasyonu
  useEffect(() => {
    if (!scanning) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [scanning])

  const handleScan = async ({ data, bounds }: { data: string; bounds?: { origin: { x: number; y: number }; size: { width: number; height: number } } }) => {
    if (loading) return
    if (!UUID_REGEX.test(data)) return
    if (bounds) {
      const cx = bounds.origin.x + bounds.size.width / 2
      const cy = bounds.origin.y + bounds.size.height / 2
      if (cx < FRAME_LEFT || cx > FRAME_RIGHT || cy < FRAME_TOP || cy > FRAME_BOTTOM) return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socketId: data, deviceUUID }),
      })
      const json = await res.json()
      setScanning(false)
      setLoading(false)
      // Bu QR oturumu e-posta doğrulaması ve kayıt adımlarında da lazım
      onSocketId(data)
      if (json.registered === false) {
        // Cihaz tanınmadı — e-posta ile hesabı bul veya yenisini aç
        onNavigate('email')
      } else {
        onNavigate('success')
      }
    } catch (err) {
      setLoading(false)
      setScanning(false)
      Alert.alert('Bağlantı Hatası', `URL: ${API_URL}\n${String(err)}`)
    }
  }

  const openScanner = async () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.93, duration: 100, useNativeDriver: true }),
      Animated.timing(btnScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start()
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) {
        Alert.alert('Kamera İzni', 'QR kodu taramak için kamera izni gereklidir.')
        return
      }
    }
    setScanning(true)
  }

  const scanLineTranslate = scanLine.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FRAME_SIZE - 4],
  })

  // ── Kamera görünümü ──
  if (scanning) {
    return (
      <View style={styles.cameraRoot}>
        <StatusBar barStyle="light-content" />
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={loading ? undefined : handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />

        {/* Flex sütun — kameraya overlay olarak tam ekranı kaplar */}
        <View style={styles.overlay}>
          {/* Üst karartma */}
          <View style={styles.maskTop} />

          {/* Orta satır: sol karartma | çerçeve | sağ karartma */}
          <View style={styles.maskMiddle}>
            <View style={styles.maskSide} />
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {!loading && (
                <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]} />
              )}
            </View>
            <View style={styles.maskSide} />
          </View>

          {/* Çerçeve hemen altı — hint + iptal */}
          <View style={{...styles.belowFrame, backgroundColor: OVERLAY_COLOR}}>
            {loading ? (
              <View style={styles.loadingBox}>
                <Text style={styles.loadingText}>Doğrulanıyor...</Text>
              </View>
            ) : (
              <Text style={styles.scanHint}>QR kodu çerçeve içine alın</Text>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanning(false)} activeOpacity={0.8}>
              <Text style={styles.cancelText}>İptal</Text>
            </TouchableOpacity>
          </View>

          {/* Alt karartma + branding */}
          <View style={styles.maskBottom}>
            <View style={styles.branding}>
              <Text style={styles.brandApp}>app</Text>
              <Text style={styles.brandIn}>in</Text>
              <Text style={styles.brandSource}>source</Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // ── Ana ekran ──
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Üst boşluk + içerik */}
      <View style={styles.body}>
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>✈</Text>
          </View>
          <Text style={styles.appName}>TravelExp Authenticator</Text>
          <Text style={styles.appSub}>Reisekosten Manager</Text>
        </View>

        <Text style={styles.infoText}>
          Masaüstü uygulamada görünen QR kodu telefonunuzla tarayarak oturum açın.
        </Text>

        <View style={styles.btnWrap}>
          <Animated.View style={{ transform: [{ scale: btnScale }], width: '100%' }}>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner} activeOpacity={0.85}>
              <Text style={styles.scanBtnIcon}>⊙</Text>
              <Text style={styles.scanBtnText}>QR Kodu Tara</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Branding — ekranın en altına sabitlendi */}
      <View style={styles.bottomFixed}>
        <View style={styles.brandingDivider} />
        <View style={styles.branding}>
          <Text style={styles.brandApp}>app</Text>
          <Text style={styles.brandIn}>in</Text>
          <Text style={styles.brandSource}>source</Text>
        </View>
      </View>
    </View>
  )
}

const CORNER_SIZE = 22
const CORNER_THICK = 3
const OVERLAY_COLOR = 'rgba(0,0,0,0.72)'

const styles = StyleSheet.create({
  // ── Ana ekran
  root: {
    flex: 1,
    backgroundColor: '#080d14',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 80,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 20,
  },
  btnWrap: { width: '100%', marginTop: 40 },
  bottomFixed: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
  },
  brandingDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginBottom: 16,
  },
  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#3b82f6', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
  },
  logoEmoji: { fontSize: 30 },
  appName: { fontSize: 22, fontWeight: '800', color: '#f1f5f9', letterSpacing: 0.5 },
  appSub: { fontSize: 13, color: '#64748b', marginTop: 4 },

  card: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  qrIconWrap: { position: 'relative', marginBottom: 20 },
  qrIcon: { fontSize: 72, color: '#1e3a5f', opacity: 0.6 },
  qrIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  qrIconCenter: { fontSize: 22, fontWeight: '800', color: '#38bdf8', letterSpacing: 2 },

  cardTitle: { fontSize: 20, fontWeight: '700', color: '#f1f5f9', marginBottom: 10 },
  cardDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 21, marginBottom: 28 },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 14, paddingVertical: 16,
    gap: 10, width: '100%',
    shadowColor: '#3b82f6', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  scanBtnIcon: { fontSize: 20, color: '#fff' },
  scanBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  footer: { marginTop: 16, fontSize: 11, color: '#334155' },

  branding: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  brandApp: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  brandIn: { fontSize: 16, fontWeight: '800', color: '#0c72ef', letterSpacing: 0.3 },
  brandSource: { fontSize: 16, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },

  // ── Kamera
  cameraRoot: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, flexDirection: 'column' },

  maskTop: { flex: 1, backgroundColor: OVERLAY_COLOR },
  maskMiddle: { flexDirection: 'row', height: FRAME_SIZE },
  maskSide: { flex: 1, backgroundColor: OVERLAY_COLOR },
  maskBottom: { flex: 1, backgroundColor: OVERLAY_COLOR, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 40 },

  frame: { width: FRAME_SIZE, height: FRAME_SIZE },

  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#38bdf8' },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderBottomRightRadius: 4 },

  scanLine: {
    position: 'absolute', left: 8, right: 8, height: 2,
    backgroundColor: '#38bdf8', opacity: 0.85,
    shadowColor: '#38bdf8', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },

  belowFrame: {
    alignItems: 'center',
    gap: 20,
    paddingTop: 32,
    paddingHorizontal: 28,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 40, paddingTop: 16,
    alignItems: 'center',
  },
  scanHint: { color: '#94a3b8', fontSize: 14 },
  loadingBox: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1, borderColor: '#38bdf8',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28,
  },
  loadingText: { color: '#38bdf8', fontSize: 15, fontWeight: '600' },
  cancelBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 52,
    shadowColor: '#ef4444', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
