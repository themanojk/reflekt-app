import Constants from "expo-constants";
import { Platform } from "react-native";

function toNativeBuild(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function getAppVersionInfo() {
  const config = Constants.expoConfig;
  const version = config?.version ?? "0.0.0";
  const nativeBuild =
    Platform.OS === "ios"
      ? toNativeBuild(config?.ios?.buildNumber)
      : toNativeBuild(config?.android?.versionCode);

  return {
    version,
    nativeBuild,
  };
}

