import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@app:token';
const USER_KEY  = '@app:user';

export async function setToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function getToken(): Promise<string | null> {
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODZmZTE2OWE3Y2NhYzNiMDk2ZTEwN2QiLCJpYXQiOjE3NTMzNjI1OTV9.jgU1VXbAF5nQ1STUj0iamUU4fEKkRKIrQB0ApcgjPKM'//AsyncStorage.getItem(TOKEN_KEY);
}
export async function setUser(user: object) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}
export async function getUser(): Promise<any> {
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