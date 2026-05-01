import { useAuth } from "@/contexts/AuthContext";
import { requestBluetoothPermission } from "@/services/appPermissions";
import { autoRegisterDeviceForPushNotifications } from "@/services/pushNotifications";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Linking } from "react-native";

function routeFromNotification(data: Record<string, unknown>) {
  const route = typeof data.route === "string" ? data.route : undefined;
  if (!route) return undefined;

  if (route.startsWith("/")) {
    return `reflekt://${route.slice(1)}`;
  }

  return `reflekt://${route}`;
}

export default function PushNotificationManager() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;

    autoRegisterDeviceForPushNotifications().catch((error) => {
      console.warn("Push registration failed", error);
    });
    requestBluetoothPermission().catch((error) => {
      console.warn("Bluetooth permission request failed", error);
    });

    const tokenSub = Notifications.addPushTokenListener(() => {
      autoRegisterDeviceForPushNotifications().catch((error) => {
        console.warn("Push token refresh registration failed", error);
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const url = routeFromNotification(data);
        if (!url) return;

        Linking.openURL(url).catch((error) => {
          console.warn("Unable to open notification route", error);
        });
      },
    );

    return () => {
      tokenSub.remove();
      responseSub.remove();
    };
  }, [loading, user]);

  return null;
}
