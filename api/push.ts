import client from "./client";
import { AppPlatform } from "./appConfig";

export type PushProvider = "expo" | "fcm" | "apns";

export type RegisterPushTokenPayload = {
  platform: AppPlatform;
  token: string;
  provider?: PushProvider;
  deviceId: string;
  appVersion?: string;
  nativeBuild: number;
  timezone?: string;
  locale?: string;
};

export type UnregisterPushTokenPayload = {
  deviceId?: string;
  token?: string;
};

export type NotificationPreferences = {
  deviceAlerts: boolean;
  switchAlerts: boolean;
  marketing: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export async function registerPushToken(payload: RegisterPushTokenPayload) {
  return client.post<{ ok: boolean }>("/push/register", payload).then((res) => res.data);
}

export async function unregisterPushToken(payload: UnregisterPushTokenPayload) {
  return client.post<{ ok: boolean }>("/push/unregister", payload).then((res) => res.data);
}

export async function getNotificationPreferences() {
  return client
    .get<NotificationPreferences>("/notification/preferences")
    .then((res) => res.data);
}

export async function updateNotificationPreferences(
  payload: Partial<NotificationPreferences>,
) {
  return client
    .put<{ ok: boolean }>("/notification/preferences", payload)
    .then((res) => res.data);
}

