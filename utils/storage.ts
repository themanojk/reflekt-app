import { User } from '@/api/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@app:token';
const USER_KEY  = '@app:user';
const ESP_IDS_KEY = '@esp:key';
const IGNORED_SENSORS_PREFIX = '@ignoredSensors:';
const ROOMS_BY_ROOM_KEY = '@roomsByRoom';
const NEARBY_DEVICES_KEY = '@nearbyDevices';
const LAST_PINS_PREFIX = '@lastPins:';
const LAST_LAYOUT_PREFIX = '@lastLayout:';

export async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken(): Promise<string | null> {
  return await AsyncStorage.getItem(TOKEN_KEY);
}
export async function setUser(user: User) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
export async function getUser(): Promise<User | null> {
  const s = await AsyncStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}
export async function clearAuth() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function storeBleDevice(id: string) {
  console.log("setting", id);
  await AsyncStorage.setItem('@lastDeviceId', id);
}

export async function getBleDevice() {
  return await AsyncStorage.getItem('@lastDeviceId');
}

export async function setESPServiceIds(ids: string[]) {
  await AsyncStorage.setItem(ESP_IDS_KEY, JSON.stringify(ids));
}
export async function getESPServiceIds(): Promise<string[]> {
  const ids =  await AsyncStorage.getItem(ESP_IDS_KEY);
  if(ids) return JSON.parse(ids);
  else return [];
}

export async function getIgnoredSensors(deviceId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(`${IGNORED_SENSORS_PREFIX}${deviceId}`);
  return raw ? JSON.parse(raw) : [];
}

export async function addIgnoredSensor(deviceId: string, mac: string) {
  const list = await getIgnoredSensors(deviceId);
  const next = Array.from(new Set([...list, mac.toUpperCase()]));
  await AsyncStorage.setItem(
    `${IGNORED_SENSORS_PREFIX}${deviceId}`,
    JSON.stringify(next)
  );
}

export async function clearIgnoredSensors(deviceId: string) {
  await AsyncStorage.removeItem(`${IGNORED_SENSORS_PREFIX}${deviceId}`);
}

export async function setRoomsByRoomCache(payload: any) {
  await AsyncStorage.setItem(ROOMS_BY_ROOM_KEY, JSON.stringify(payload));
}

export async function getRoomsByRoomCache(): Promise<any[] | null> {
  const raw = await AsyncStorage.getItem(ROOMS_BY_ROOM_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setNearbyDevicesCache(payload: any) {
  await AsyncStorage.setItem(NEARBY_DEVICES_KEY, JSON.stringify(payload));
}

export async function getNearbyDevicesCache(): Promise<any[] | null> {
  const raw = await AsyncStorage.getItem(NEARBY_DEVICES_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function setLastPins(deviceId: string, pins: Record<number, boolean>) {
  await AsyncStorage.setItem(
    `${LAST_PINS_PREFIX}${deviceId}`,
    JSON.stringify(pins)
  );
}

export async function getLastPins(deviceId: string): Promise<Record<number, boolean> | null> {
  const raw = await AsyncStorage.getItem(`${LAST_PINS_PREFIX}${deviceId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setLastLayout(deviceId: string, buttons: any[]) {
  await AsyncStorage.setItem(
    `${LAST_LAYOUT_PREFIX}${deviceId}`,
    JSON.stringify(buttons)
  );
}

export async function getLastLayout(deviceId: string): Promise<any[] | null> {
  const raw = await AsyncStorage.getItem(`${LAST_LAYOUT_PREFIX}${deviceId}`);
  return raw ? JSON.parse(raw) : null;
}
