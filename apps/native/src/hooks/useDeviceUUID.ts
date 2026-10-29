import * as Device from 'expo-device'

export function useDeviceUUID(): string {
  // Expo Device modelId + osBuildId kombinasyonu cihaza özgü sabit bir ID üretir
  const raw = `${Device.modelId ?? 'unknown'}-${Device.osBuildId ?? 'unknown'}`
  return raw
}
