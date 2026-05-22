import { NativeModules, Platform } from "react-native";

export type WifiNetwork = {
  ssid: string;
  bssid?: string;
  level?: number;
  capabilities?: string;
  frequency?: number;
  isCurrent?: boolean;
};

type WifiScannerModule = {
  getAvailableNetworks?: () => Promise<WifiNetwork[]>;
};

const wifiScannerModule: WifiScannerModule = NativeModules.WifiScanner ?? {};

export async function getAvailableWifiNetworks(): Promise<WifiNetwork[]> {
  if (Platform.OS !== "android" || !wifiScannerModule.getAvailableNetworks) {
    return [];
  }

  const networks = await wifiScannerModule.getAvailableNetworks();
  if (!Array.isArray(networks)) return [];

  return networks
    .filter((network): network is WifiNetwork => !!network?.ssid)
    .sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return (b.level ?? -999) - (a.level ?? -999);
    });
}
