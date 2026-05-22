import { PermissionsAndroid, Platform } from "react-native";
import {
  check,
  checkMultiple,
  openSettings,
  PERMISSIONS,
  request,
  requestMultiple,
  RESULTS,
} from "react-native-permissions";

export type AppPermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable"
  | "limited";

function normalizePermissionStatus(status: string): AppPermissionStatus {
  if (status === RESULTS.GRANTED) return "granted";
  if (status === RESULTS.BLOCKED) return "blocked";
  if (status === RESULTS.UNAVAILABLE) return "unavailable";
  if (status === RESULTS.LIMITED) return "limited";
  return "denied";
}

export async function requestBluetoothPermission(): Promise<AppPermissionStatus> {
  if (Platform.OS === "ios") {
    const status = await request(PERMISSIONS.IOS.BLUETOOTH);
    return normalizePermissionStatus(status);
  }

  if (Platform.OS !== "android") return "granted";

  if (Platform.Version >= 31) {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
    const statuses = await PermissionsAndroid.requestMultiple(permissions);
    const allGranted = permissions.every(
      (permission) => statuses[permission] === PermissionsAndroid.RESULTS.GRANTED,
    );

    return allGranted ? "granted" : "denied";
  }

  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return status === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
}

export async function checkBluetoothPermission(): Promise<AppPermissionStatus> {
  if (Platform.OS === "ios") {
    return normalizePermissionStatus(await check(PERMISSIONS.IOS.BLUETOOTH));
  }

  if (Platform.OS !== "android") return "granted";

  if (Platform.Version >= 31) {
    const statuses = await checkMultiple([
      PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
    ]);
    const allGranted =
      statuses[PERMISSIONS.ANDROID.BLUETOOTH_SCAN] === RESULTS.GRANTED &&
      statuses[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT] === RESULTS.GRANTED;
    return allGranted ? "granted" : "denied";
  }

  return normalizePermissionStatus(
    await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
  );
}

export async function requestWifiScanPermission(): Promise<AppPermissionStatus> {
  if (Platform.OS !== "android") return "unavailable";

  if (Platform.Version >= 33) {
    const statuses = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return statuses[PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES] ===
      PermissionsAndroid.RESULTS.GRANTED &&
      statuses[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
        PermissionsAndroid.RESULTS.GRANTED
      ? "granted"
      : "denied";
  }

  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return status === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
}

export async function openAppPermissionSettings() {
  await openSettings();
}
