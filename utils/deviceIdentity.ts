import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "@app:deviceId";

function createDeviceId() {
  const random = Math.random().toString(36).slice(2, 12);
  return `device-${Date.now().toString(36)}-${random}`;
}

export async function getStableDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const next = createDeviceId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

