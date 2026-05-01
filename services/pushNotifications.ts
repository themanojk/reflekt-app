import { currentAppPlatform } from "@/api/appConfig";
import { registerPushToken, unregisterPushToken } from "@/api/push";
import { getAppVersionInfo } from "@/utils/appVersion";
import { getStableDeviceId } from "@/utils/deviceIdentity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const LAST_PUSH_TOKEN_KEY = "@app:lastPushToken";
const LAST_PUSH_REGISTRATION_KEY = "@app:lastPushRegistration";
const LAST_PUSH_ATTEMPT_KEY = "@app:lastPushRegistrationAttempt";
const AUTO_RETRY_INTERVAL_MS = 12 * 60 * 60 * 1000;

let registrationInFlight: Promise<PushRegistrationResult> | null = null;
let autoRegistrationAttempted = false;

type PushRegistrationResult =
  | { registered: true; token: string; skipped?: false }
  | {
      registered: false;
      reason:
        | "permission-denied"
        | "android-fcm-missing"
        | "already-registered";
      skipped?: boolean;
    };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    undefined
  );
}

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getLocale() {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return locale || undefined;
}

export async function getLastPushToken() {
  return AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
}

export async function getNotificationPermissionStatus() {
  return Notifications.getPermissionsAsync();
}

async function setLastPushToken(token: string) {
  await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, token);
}

function registrationKey(params: {
  token: string;
  deviceId: string;
  version: string;
  nativeBuild: number;
}) {
  return [
    params.token,
    params.deviceId,
    params.version,
    String(params.nativeBuild),
    currentAppPlatform(),
  ].join("|");
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2563eb",
  });
}

async function ensureNotificationPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function registerDeviceForPushNotificationsOnce(options?: {
  force?: boolean;
}): Promise<PushRegistrationResult> {
  await ensureAndroidNotificationChannel();

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission)
    return { registered: false, reason: "permission-denied" as const };

  const projectId = getProjectId();
  let tokenResponse: Notifications.ExpoPushToken;
  try {
    tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (
      Platform.OS === "android" &&
      (message.includes("Default FirebaseApp is not initialized") ||
        message.includes("fcm-credentials"))
    ) {
      return { registered: false, reason: "android-fcm-missing" as const };
    }
    throw error;
  }
  const token = tokenResponse.data;
  const deviceId = await getStableDeviceId();
  const versionInfo = getAppVersionInfo();
  const nextRegistrationKey = registrationKey({
    token,
    deviceId,
    version: versionInfo.version,
    nativeBuild: versionInfo.nativeBuild,
  });
  const previousRegistrationKey = await AsyncStorage.getItem(
    LAST_PUSH_REGISTRATION_KEY,
  );
  const previousAttemptRaw = await AsyncStorage.getItem(LAST_PUSH_ATTEMPT_KEY);
  const previousAttempt = previousAttemptRaw
    ? JSON.parse(previousAttemptRaw)
    : null;
  const recentlyAttempted =
    previousAttempt?.key === nextRegistrationKey &&
    Date.now() - Number(previousAttempt?.at || 0) < AUTO_RETRY_INTERVAL_MS;

  if (
    !options?.force &&
    (previousRegistrationKey === nextRegistrationKey || recentlyAttempted)
  ) {
    await setLastPushToken(token);
    return { registered: false, reason: "already-registered", skipped: true };
  }

  await AsyncStorage.setItem(
    LAST_PUSH_ATTEMPT_KEY,
    JSON.stringify({ key: nextRegistrationKey, at: Date.now() }),
  );

  await registerPushToken({
    platform: currentAppPlatform(),
    token,
    provider: "expo",
    deviceId,
    appVersion: versionInfo.version,
    nativeBuild: versionInfo.nativeBuild,
    timezone: getTimezone(),
    locale: getLocale(),
  });

  await setLastPushToken(token);
  await AsyncStorage.setItem(LAST_PUSH_REGISTRATION_KEY, nextRegistrationKey);
  return { registered: true, token };
}

export async function registerDeviceForPushNotifications(options?: {
  force?: boolean;
}) {
  if (!registrationInFlight) {
    registrationInFlight = registerDeviceForPushNotificationsOnce(options).finally(
      () => {
        registrationInFlight = null;
      },
    );
  }

  return registrationInFlight;
}

export async function autoRegisterDeviceForPushNotifications() {
  if (autoRegistrationAttempted) {
    return { registered: false, reason: "already-registered" as const, skipped: true };
  }

  autoRegistrationAttempted = true;
  return registerDeviceForPushNotifications();
}

export async function unregisterCurrentPushToken() {
  const deviceId = await getStableDeviceId();
  const token = await getLastPushToken();

  await unregisterPushToken({
    deviceId,
    token: token || undefined,
  });

  await AsyncStorage.removeItem(LAST_PUSH_TOKEN_KEY);
  await AsyncStorage.removeItem(LAST_PUSH_REGISTRATION_KEY);
  await AsyncStorage.removeItem(LAST_PUSH_ATTEMPT_KEY);
  autoRegistrationAttempted = false;
}
