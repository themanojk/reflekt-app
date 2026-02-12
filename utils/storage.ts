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
const IGNORED_SWITCHBOARDS_KEY = '@ignoredSwitchboards';
const PENDING_SWITCHBOARD_DEVICE_KEY = '@pendingSwitchboardDeviceId';

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

export async function getIgnoredSwitchboards(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(IGNORED_SWITCHBOARDS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addIgnoredSwitchboard(id: string) {
  const list = await getIgnoredSwitchboards();
  const next = Array.from(new Set([...list, id.toUpperCase()]));
  await AsyncStorage.setItem(IGNORED_SWITCHBOARDS_KEY, JSON.stringify(next));
}

export async function clearIgnoredSwitchboards() {
  await AsyncStorage.removeItem(IGNORED_SWITCHBOARDS_KEY);
}

export async function setPendingSwitchboardDeviceId(id: string) {
  await AsyncStorage.setItem(PENDING_SWITCHBOARD_DEVICE_KEY, id);
}

export async function getPendingSwitchboardDeviceId(): Promise<string | null> {
  return await AsyncStorage.getItem(PENDING_SWITCHBOARD_DEVICE_KEY);
}

export async function clearPendingSwitchboardDeviceId() {
  await AsyncStorage.removeItem(PENDING_SWITCHBOARD_DEVICE_KEY);
}

export async function clearBoardCache() {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(
    (k) => k.startsWith(LAST_PINS_PREFIX) || k.startsWith(LAST_LAYOUT_PREFIX)
  );
  toRemove.push(
    ROOMS_BY_ROOM_KEY,
    NEARBY_DEVICES_KEY,
    IGNORED_SWITCHBOARDS_KEY,
    PENDING_SWITCHBOARD_DEVICE_KEY
  );
  const unique = Array.from(new Set(toRemove));
  if (unique.length) {
    await AsyncStorage.multiRemove(unique);
  }
}

export async function clearSensorCache() {
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter((k) => k.startsWith(IGNORED_SENSORS_PREFIX));
  if (toRemove.length) {
    await AsyncStorage.multiRemove(toRemove);
  }
}
