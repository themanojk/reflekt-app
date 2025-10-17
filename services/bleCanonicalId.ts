// bleCanonicalId.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { BleManager, Device } from 'react-native-ble-plx';

(global as any).Buffer = (global as any).Buffer || Buffer;

const manager = new BleManager();
const DIS_SERVICE = '180A';
const SERIAL_CHAR  = '2A25';

async function connectSafely(device: Device): Promise<Device> {
  const isConnected = await device.isConnected();
  if (isConnected) return device;
  // small retry to avoid transient failures
  let lastErr: any;
  for (let i = 0; i < 2; i++) {
    try {
      return await manager.connectToDevice(device.id, { autoConnect: false, timeout: 8000 });
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

function normalizeMac(txt: string) {
  // "d0:ef:76:34:93:ee" -> "D0:EF:76:34:93:EE"
  return txt.trim().toUpperCase();
}

/**
 * Always returns the same canonical ID from the device’s firmware:
 *  - We read DIS/Serial Number (you set it to BLE MAC or your own serial on the ESP).
 *  - Cached so iOS doesn’t need to reconnect next time.
 */
export async function getCanonicalId(device: Device, opts?: { disconnectAfter?: boolean }): Promise<string> {
  const cacheKey = `ble:canonical:${device.id}`;
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) return cached;

  // Connect and read DIS/2A25
  const connected = await connectSafely(device);
  try {
    await connected.discoverAllServicesAndCharacteristics();
    const ch = await connected.readCharacteristicForService(DIS_SERVICE, SERIAL_CHAR);
    if (!ch?.value) throw new Error('No DIS serial value');
    const serial = Buffer.from(ch.value, 'base64').toString('utf8');
    const canonical = normalizeMac(serial); // if you stored MAC; otherwise keep as-is
    await AsyncStorage.setItem(cacheKey, canonical);
    return canonical;
  } finally {
    if (opts?.disconnectAfter !== false) {
      try { await connected.cancelConnection(); } catch {}
    }
  }
}
