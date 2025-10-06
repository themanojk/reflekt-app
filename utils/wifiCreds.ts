import * as SecureStore from "expo-secure-store";

export async function saveWifi(ssid: string, pass: string) {
  await SecureStore.setItemAsync("wifiCreds", JSON.stringify({ ssid, pass }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function loadWifi() {
  const v = await SecureStore.getItemAsync("wifiCreds");
  return v ? JSON.parse(v) : null;
}
export async function clearWifi() {
  await SecureStore.deleteItemAsync("wifiCreds");
}
