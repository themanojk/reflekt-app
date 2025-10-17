// bleIds.ts
import { CanonicalBleDevice, CanonicalId } from '@/constants/types';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import type { Device } from 'react-native-ble-plx';

// Ensure Buffer exists (some RN setups need this)
(global as any).Buffer = (global as any).Buffer || Buffer;

/** If you advertised the MAC in manufacturerData (last 6 bytes), extract it. */
export function macFromManufacturerData(b64?: string | null): string | null {
  if (!b64) return null;
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 6) return null;
  return [...bytes.slice(-6)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

/** Cross-platform scan ID: Android=device.id (MAC), iOS=MAC from manufacturerData if present, else device.id */
export function getScanId(device: Device): string {
  if (Platform.OS === 'android') return device.id;
  return macFromManufacturerData(device.manufacturerData) ?? device.id;
}

/** Build a row (before you know canonicalId) */
export function makeRow(device: Device, canonicalId?: CanonicalId): CanonicalBleDevice {
  return {
    key: canonicalId ?? device.id,
    canonicalId,
    transportId: device.id,
    device,
    name: device.name ?? null,
    rssi: device.rssi ?? null,
    lastSeen: Date.now(),
  };
}

/** Update a row when you later discover the canonicalId (after connect) */
export function applyCanonicalId(
  list: CanonicalBleDevice[],
  transportId: string,
  canonicalId: CanonicalId
): CanonicalBleDevice[] {
  const next = list.map(row =>
    row.transportId === transportId ? { ...row, canonicalId, key: canonicalId } : row
  );
  // Optional: merge any duplicates that now share the same canonicalId
  const map = new Map<string, CanonicalBleDevice>();
  for (const r of next) {
    const k = (r.canonicalId ?? r.transportId);
    const prev = map.get(k);
    if (!prev) map.set(k, r);
    else {
      map.set(k, {
        ...prev,
        ...r,
        rssi: r.rssi ?? prev.rssi,
        lastSeen: Math.max(prev.lastSeen, r.lastSeen),
      });
    }
  }
  return [...map.values()];
}