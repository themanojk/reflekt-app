import { Platform } from "react-native";
import client from "./client";

export type AppPlatform = "ios" | "android";

export type AppUpdateConfig = {
  required: boolean;
  recommended: boolean;
  canSkip: boolean;
  minVersion?: string;
  minNativeBuild?: number;
  latestVersion?: string;
  latestNativeBuild?: number;
  title?: string;
  message?: string;
  storeUrl?: string;
};

export type AppConfigResponse = {
  update?: AppUpdateConfig;
  features?: {
    pushNotifications?: boolean;
    [key: string]: boolean | undefined;
  };
};

export function currentAppPlatform(): AppPlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}

export async function getAppConfig(params: {
  version: string;
  nativeBuild: number;
  platform?: AppPlatform;
}): Promise<AppConfigResponse> {
  const platform = params.platform ?? currentAppPlatform();
  const response = await client.get<AppConfigResponse>("/app/config", {
    params: {
      platform,
      version: params.version,
      nativeBuild: params.nativeBuild,
    },
  });

  return response.data;
}

