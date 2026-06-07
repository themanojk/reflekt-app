import {
  AdminNearbyDeviceDetails,
  fetchAdminDeviceDetailsByMac,
  getLayout,
} from "@/api/devics";
import Toast from "@/components/Toast";
import { fetchServiceIds } from "@/api/service";
import { getCanonicalId } from "@/services/bleCanonicalId";
import BLEManagerService from "@/services/bleManager";
import { setESPServiceIds } from "@/utils/storage";
import { Bluetooth, User } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Device } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Row = {
  id: string;
  name: string | null;
  rssi: number | null;
  device: Device;
  canonicalId?: string;
};

const formatRssi = (rssi: number | null) =>
  typeof rssi === "number" ? `${rssi} dBm` : "N/A";

const estimateDistanceMeters = (rssi: number | null): string => {
  if (typeof rssi !== "number") return "N/A";
  const txPowerAt1m = -59;
  const pathLossExponent = 2.2;
  const distance = Math.pow(
    10,
    (txPowerAt1m - rssi) / (10 * pathLossExponent),
  );
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0.05, Math.min(distance, 99.9))
    : 99.9;
  return `${safeDistance.toFixed(safeDistance < 10 ? 2 : 1)} m`;
};

const normalizeId = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toUpperCase();

const getReadableError = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeMessage = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
    const maybeReason = "reason" in error ? (error as { reason?: unknown }).reason : null;
    if (typeof maybeReason === "string" && maybeReason.trim()) {
      return maybeReason.trim();
    }
  }
  return "Unknown error";
};

export default function AddSwitchboardAdminScreen({ navigation }: any) {
  const bleManagerRef = React.useRef<BLEManagerService | null>(null);
  if (!bleManagerRef.current) {
    bleManagerRef.current = new BLEManagerService();
  }
  const bleManager = bleManagerRef.current;

  const [scanning, setScanning] = useState(true);
  const [devices, setDevices] = useState<Row[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [deviceDetailsByMac, setDeviceDetailsByMac] = useState<
    Record<string, AdminNearbyDeviceDetails | null>
  >({});
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        const aRssi =
          typeof a.rssi === "number" ? a.rssi : Number.NEGATIVE_INFINITY;
        const bRssi =
          typeof b.rssi === "number" ? b.rssi : Number.NEGATIVE_INFINITY;
        return bRssi - aRssi;
      }),
    [devices],
  );

  useEffect(() => {
    const refreshServiceIds = async () => {
      try {
        const ids = await fetchServiceIds();
        if (ids.length) {
          await setESPServiceIds(ids);
          await bleManager.mapServiceIds();
        }
      } catch {
        // offline fallback: scanner uses cached IDs
      }
    };
    void refreshServiceIds();
  }, [bleManager]);

  const showToast = (message: string) => {
    setToast({ visible: true, message });
  };

  const onDeviceFound = React.useCallback(async (device: Device) => {
    let canonicalId = device.id;
    try {
      canonicalId = await getCanonicalId(device);
    } catch {
      canonicalId = device.id;
    }

    const normalizedCanonicalId = normalizeId(canonicalId || device.id);

    setDevices((prev) => {
      const index = prev.findIndex(
        (row) => normalizeId(row.canonicalId || row.id) === normalizedCanonicalId,
      );

      if (index >= 0) {
        const next = [...prev];
        next[index] = {
          ...next[index],
          id: device.id,
          name: device.name ?? next[index].name,
          rssi: device.rssi ?? next[index].rssi,
          device,
          canonicalId: normalizedCanonicalId,
        };
        return next;
      }

      return [
        ...prev,
        {
          id: device.id,
          name: device.name ?? null,
          rssi: device.rssi ?? null,
          device,
          canonicalId: normalizedCanonicalId,
        },
      ];
    });
  }, []);

  const runScan = React.useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setDevices([]);
    setDeviceDetailsByMac({});
    try {
      const { done } = bleManager.startScan_new(onDeviceFound, {
        stopAfterMs: 30000,
      });
      await done;
    } finally {
      setScanning(false);
    }
  }, [bleManager, onDeviceFound, scanning]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setScanning(true);
      try {
        const { done } = bleManager.startScan_new(onDeviceFound, {
          stopAfterMs: 30000,
        });
        await done;
      } finally {
        if (!cancelled) setScanning(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      bleManager.stopScan();
    };
  }, [bleManager, onDeviceFound]);

  useEffect(() => {
    const pendingMacs = Array.from(
      new Set(
        devices
          .map((row) => normalizeId(row.canonicalId || row.id))
          .filter(
            (mac) =>
              !!mac && !Object.prototype.hasOwnProperty.call(deviceDetailsByMac, mac),
          ),
      ),
    );

    if (!pendingMacs.length) return;

    let cancelled = false;

    const hydrate = async () => {
      const results = await Promise.all(
        pendingMacs.map(async (mac) => [mac, await fetchAdminDeviceDetailsByMac(mac)] as const),
      );

      if (cancelled) return;

      setDeviceDetailsByMac((prev) => {
        const next = { ...prev };
        results.forEach(([mac, details]) => {
          next[mac] = details;
        });
        return next;
      });
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [deviceDetailsByMac, devices]);

  const handleDeviceSelect = async (row: Row) => {
    const { device, canonicalId } = row;
    const normalizedMac = normalizeId(canonicalId || device.id);
    const details = deviceDetailsByMac[normalizedMac];

    console.log("[ADMIN_SCAN][select][start]", {
      transportId: device.id,
      normalizedMac,
      bleName: row.name,
      details,
    });

    setConnectingId(device.id);
    bleManager.stopScan();

    try {
      try {
        await AsyncStorage.setItem(`ble:byCanonical:${normalizedMac}`, device.id);
        await AsyncStorage.setItem(`ble:canonical:${device.id}`, normalizedMac);
      } catch {}

      const layout = await getLayout(normalizedMac);
      console.log("[ADMIN_SCAN][select][layout-result]", {
        normalizedMac,
        layout,
      });
      const resolvedServiceId = details?.service_id || layout?.serviceId || "";
      if (!resolvedServiceId) {
        showToast("No service id found for this device");
        return;
      }

      void bleManager
        .connectSafely(device.id, {
          retries: 2,
          connectTimeoutMs: 6000,
          autoConnect: false,
          skipScan: true,
          scanTimeoutMs: 2500,
        })
        .catch((error) => {
          console.warn("[ADMIN_SCAN] warm BLE connect failed", error);
        });

      navigation.navigate("Switchboard", {
        switchboardName:
          details?.title || row.name || `Device ${normalizedMac.slice(-5)}`,
        deviceId: normalizedMac,
        roomIcon: "",
        status: true,
        iosBleId: device.id,
        bleId: device.id,
        service_id: resolvedServiceId,
        roomName: details?.user_name || "",
        sensors: [],
      });
    } catch (error) {
      console.error("[ADMIN_SCAN] device selection failed", error);
      console.error("[ADMIN_SCAN][select][error-detail]", {
        transportId: device.id,
        normalizedMac,
        message:
          error instanceof Error ? error.message : String(error || "Unknown error"),
        responseStatus: (error as any)?.response?.status,
        responseBody: (error as any)?.response?.data,
      });
      showToast(`Unable to open device: ${getReadableError(error)}`);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        duration={2200}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nearby Devices</Text>
          <Text style={styles.subtitle}>
            Admin mode opens the device directly for testing and QA sign-off.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <User size={18} color="#cbd5e1" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.scanInfoCard}>
        <View style={styles.scanIcon}>
          <Bluetooth size={24} color="#60a5fa" />
        </View>
        <View style={styles.scanInfoText}>
          <Text style={styles.scanInfoTitle}>
            {scanning ? "Scanning nearby switchboards" : "Scan complete"}
          </Text>
          <Text style={styles.scanInfoSubtitle}>
            {scanning
              ? "Fetching BLE devices and checking server ownership details."
              : "Tap any device to open the device details page directly."}
          </Text>
        </View>
      </View>

      {scanning && devices.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.emptyText}>Looking for nearby switchboards...</Text>
        </View>
      ) : null}

      {!scanning && sortedDevices.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No devices found nearby</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={runScan}>
            <Text style={styles.refreshButtonText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {sortedDevices.length > 0 ? (
        <ScrollView style={styles.deviceList} contentContainerStyle={styles.deviceListContent}>
          {sortedDevices.map((row) => {
            const macAddress = normalizeId(row.canonicalId || row.id);
            const details = deviceDetailsByMac[macAddress];
            const isConnecting = connectingId === row.device.id;

            return (
              <TouchableOpacity
                key={macAddress}
                style={styles.deviceCard}
                disabled={isConnecting}
                onPress={() => handleDeviceSelect(row)}
              >
                <View style={styles.deviceCardHeader}>
                  <View style={styles.deviceBadge}>
                    <Bluetooth size={18} color="#60a5fa" />
                  </View>
                  <View style={styles.deviceHeaderText}>
                    <Text style={styles.deviceMac}>{macAddress}</Text>
                    <Text style={styles.deviceServerName}>
                      {details?.title || row.name || "Unnamed switchboard"}
                    </Text>
                  </View>
                  {isConnecting ? (
                    <ActivityIndicator color="#60a5fa" size="small" />
                  ) : (
                    <Text style={styles.openText}>Open</Text>
                  )}
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>User</Text>
                  <Text style={styles.metaValue}>
                    {details?.user_name || details?.user_phone || "Unassigned"}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>BLE Name</Text>
                  <Text style={styles.metaValue}>{row.name || "Unknown"}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Signal</Text>
                  <Text style={styles.metaValue}>{formatRssi(row.rssi)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Approx Distance</Text>
                  <Text style={styles.metaValue}>
                    {estimateDistanceMeters(row.rssi)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <TouchableOpacity style={styles.refreshButton} onPress={runScan} disabled={scanning}>
        <Text style={styles.refreshButtonText}>
          {scanning ? "Scanning..." : "Refresh"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 280,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  scanInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  scanIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f274f",
  },
  scanInfoText: {
    flex: 1,
  },
  scanInfoTitle: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700",
  },
  scanInfoSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    color: "#cbd5e1",
    fontSize: 15,
  },
  deviceList: {
    flex: 1,
  },
  deviceListContent: {
    paddingBottom: 16,
  },
  deviceCard: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  deviceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  deviceBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f274f",
    marginRight: 12,
  },
  deviceHeaderText: {
    flex: 1,
  },
  deviceMac: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  deviceServerName: {
    color: "#93c5fd",
    fontSize: 13,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  metaLabel: {
    color: "#94a3b8",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    color: "#e2e8f0",
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
  },
  openText: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "700",
  },
  refreshButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
  },
  refreshButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
