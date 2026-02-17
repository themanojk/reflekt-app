import { Bluetooth } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Device as BleDevice, Device } from "react-native-ble-plx";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useFocusEffect } from "@react-navigation/native";

import {
  AddDevice,
  addDevice,
  fetchDevicesByRoomForUser,
  getLayout,
} from "@/api/devics";
import { fetchServiceIds } from "@/api/service";
import Toast from "@/components/Toast";
import { DATA_CHAR_UUID } from "@/constants";
import { getCanonicalId } from "@/services/bleCanonicalId";
import BLEManagerService from "@/services/bleManager";
import { getLayoutButtonsByServiceId } from "@/db/layout_buttons";
import {
  clearPendingSwitchboardDeviceId,
  getRoomsByRoomCache,
  setESPServiceIds,
  setLastLayout,
  setRoomsByRoomCache,
  storeBleDevice,
} from "@/utils/storage";
import { loadWifi, saveWifi } from "@/utils/wifiCreds";
import { Buffer } from "buffer";

type Step = "scan" | "form";

type Row = {
  id: string; // transport id (device.id)
  name: string | null;
  rssi: number | null;
  device: Device;
  canonicalId?: string; // <-- added directly on the row
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

const normalizeSensors = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((v) => String(v || "").trim().toUpperCase())
          .filter(Boolean),
      ),
    );
  }
  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((v) => v.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
  }
  return [];
};

const extractSensorsFromAddResponse = (payload: any): string[] => {
  const candidates = [
    payload?.sensors,
    payload?.sensor_ids,
    payload?.device?.sensors,
    payload?.device?.sensor_ids,
    payload?.data?.sensors,
    payload?.data?.sensor_ids,
    payload?.result?.sensors,
    payload?.result?.sensor_ids,
  ];
  for (const c of candidates) {
    const list = normalizeSensors(c);
    if (list.length) return list;
  }
  return [];
};

export default function AddSwitchboardScreen({ navigation, route }: any) {
  const bleManagerRef = React.useRef<BLEManagerService | null>(null);
  if (!bleManagerRef.current) {
    bleManagerRef.current = new BLEManagerService();
  }
  const bleManager = bleManagerRef.current;
  const { roomId, pendingDeviceId, prefillName, roomName, roomIcon } = route.params;
  const [_connectingId, setConnectingId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("scan");
  const [scanning, setScanning] = useState(true);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [devices, setDevices] = useState<Row[]>([]);
  const [device, setDevice] = useState<BleDevice>();
  const [_selectedDevice, setSelectedDevice] = useState<BleDevice | null>(null);
  const [name, setName] = useState(prefillName || "");
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(
    null,
  );
  const [serviceIdFromLayout, setServiceIdFromLayout] = useState("");
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const [existingDeviceIds, setExistingDeviceIds] = useState<Set<string>>(new Set());
  const sortedDevices = React.useMemo(
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
    refreshServiceIds();
  }, [bleManager]);

  // Scan ring animation
  const ring1 = React.useRef(new Animated.Value(0)).current;
  const ring2 = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!scanning) {
      ring1.setValue(0);
      ring2.setValue(0);
      return;
    }
    const createRing = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a1 = createRing(ring1, 0);
    const a2 = createRing(ring2, 900);
    a1.start();
    a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [scanning]);

  const refreshExistingDeviceIds = React.useCallback(async () => {
    try {
      const byRoom = await fetchDevicesByRoomForUser();
      if (Array.isArray(byRoom)) {
        await setRoomsByRoomCache(byRoom);
        const serverIds = new Set<string>();
        byRoom.forEach((r: any) => {
          (r?.devices || []).forEach((d: any) => {
            const id = String(d?.device_id || "")
              .trim()
              .toUpperCase();
            if (id) serverIds.add(id);
          });
        });
        setExistingDeviceIds(serverIds);
        return;
      }
    } catch (e) {
      console.warn("[ADD_BOARD_SCAN] server existing-device fetch failed", e);
    }
    try {
      const cachedByRoom = await getRoomsByRoomCache();
      if (Array.isArray(cachedByRoom)) {
        const cachedIds = new Set<string>();
        cachedByRoom.forEach((r: any) => {
          (r?.devices || []).forEach((d: any) => {
            const id = String(d?.device_id || "")
              .trim()
              .toUpperCase();
            if (id) cachedIds.add(id);
          });
        });
        setExistingDeviceIds(cachedIds);
        return;
      }
    } catch {}

    setExistingDeviceIds(new Set());
  }, []);

  useEffect(() => {
    refreshExistingDeviceIds();
  }, [refreshExistingDeviceIds]);

  useFocusEffect(
    React.useCallback(() => {
      refreshExistingDeviceIds();
      return () => {};
    }, [refreshExistingDeviceIds]),
  );

  const showToast = (msg: string) => {
    setToast({ visible: true, message: msg });
  };

  const loadWifiCreds = async () => {
    const creds = await loadWifi();
    if (!creds || !creds.ssid) return;

    setWifiSSID(creds.ssid);
    setWifiPassword(creds.pass);
  };

  useEffect(() => {
    if (prefillName) setName(prefillName);
  }, [prefillName]);

  const onDeviceFound = React.useCallback(async (device: Device) => {
    console.log(
      "[ADD_BOARD_SCAN] seen",
      device.id,
      device.name,
      "rssi=",
      device.rssi,
    );
    let canonicalId = device.id;

    try {
      canonicalId = await getCanonicalId(device);
    } catch {}

    setDevices((prev) => {
      const idx = prev.findIndex((d) => d.canonicalId === canonicalId);

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          name: device.name ?? next[idx].name,
          rssi: device.rssi ?? next[idx].rssi,
          device,
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
          canonicalId,
        },
      ];
    });

    if (pendingDeviceId) {
      const candidate = canonicalId || device.id;
      if (String(candidate).toUpperCase() === String(pendingDeviceId).toUpperCase()) {
        handleDeviceSelect({
          id: device.id,
          name: device.name ?? null,
          rssi: device.rssi ?? null,
          device,
          canonicalId,
        });
      }
    }
  }, []);

  const runScan = React.useCallback(async () => {
    if (scanning) return; // prevent double taps
    setScanning(true);
    try {
      await refreshExistingDeviceIds();
      const { done } = bleManager.startScan_new(onDeviceFound, {
        stopAfterMs: 30000,
      });
      await done; // await completion (auto-stop or manual)
    } finally {
      setScanning(false);
    }
  }, [bleManager, onDeviceFound, refreshExistingDeviceIds, scanning]);

  const handleBleIconRefresh = React.useCallback(() => {
    if (scanning) return;
    setDevices([]);
    runScan();
  }, [scanning, runScan]);

  const handlePullToRefresh = React.useCallback(async () => {
    if (scanning) {
      setPullRefreshing(false);
      return;
    }
    setDevices([]);
    setPullRefreshing(true);
    try {
      await runScan();
    } finally {
      setPullRefreshing(false);
    }
  }, [scanning, runScan]);

  useEffect(() => {
    if (step !== "scan") return;

    let cancelled = false;

    const start = async () => {
      setScanning(true);
      try {
        await refreshExistingDeviceIds();
        const { done } = bleManager.startScan_new(onDeviceFound, {
          stopAfterMs: 30000,
        });
        await done;
      } finally {
        if (!cancelled) setScanning(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      bleManager.stopScan();
    };
  }, [step, refreshExistingDeviceIds]);

  useEffect(() => {
    loadWifiCreds();
  }, []);

  const getDeviceLayout = async (deviceId: string | undefined) => {
    try {
      if (!deviceId) return;
      console.info("Fetching layout for", deviceId);
      const deviceLayout = await getLayout(deviceId);
      return deviceLayout;
    } catch (err) {
      console.log("Error while fetching layout", err);
      return null;
    }
  };

  const resolveCanonicalId = async (
    bleDevice: BleDevice,
    fallback?: string | null,
  ) => {
    let canonical = fallback || bleDevice.id;
    try {
      canonical = await getCanonicalId(bleDevice, {
        disconnectAfter: false,
        skipCache: true,
      });
    } catch {}
    return canonical || bleDevice.id;
  };

  const sendWifiConfigToESP = async (device: BleDevice) => {
    if (!wifiSSID.trim() || !wifiPassword.trim()) {
      Alert.alert("Error", "Please enter a WiFi network name");
      return;
    }

    await saveWifi(wifiSSID, wifiPassword);
    const serviceIds = await bleManager.getCustomServiceId(device);
    if (!serviceIds.length) return;

    const text = `WIFI:${wifiSSID};${wifiPassword}`;
    console.log("Send to ESP:", text);
    //await bleManager.sendData(device, text, serviceIds[0]);
    await bleManager.safeWrite({
      device,
      serviceUUID: serviceIds[0],
      charUUID: DATA_CHAR_UUID,
      base64Payload: Buffer.from(text).toString("base64"),
    });
  };

  const handleDeviceSelect = async (bleDevice: Row) => {
    const { device, canonicalId } = bleDevice;
    console.log("Starting connection");
    setConnectingId(device.id);
    bleManager.stopScan();

    try {
      await bleManager.connect(device);
      const canonical = await resolveCanonicalId(device, canonicalId);
      const layout = await getDeviceLayout(canonical);

      if (!layout) {
        showToast("Unrecognized device");
      } else {
        if (layout?.serviceId) {
          setServiceIdFromLayout(layout.serviceId);
        }
        setSelectedCanonicalId(canonical || null);
        await storeBleDevice(device.id);
        setSelectedDevice(device);
        setName(device.id);
        setStep("form");
        setDevice(device);
      }
      setConnectingId(null);
    } catch (err) {
      console.error("Connection failed", err);
      setConnectingId(null);
    }
  };

  const handleAddSwitchboard = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a switchboard name");
      return;
    }
    if (!device) {
      Alert.alert("Error", "Bluetooth connection failed");
      return;
    }
    setLoading(true);
    let canonicalId = selectedCanonicalId;
    if (!canonicalId || canonicalId === device.id) {
      canonicalId = await resolveCanonicalId(device, canonicalId);
      setSelectedCanonicalId(canonicalId);
    }
    const deviceMac = canonicalId || device.id;
    const body: AddDevice = {
      title: name,
      room_id: roomId,
      device_id: deviceMac,
      os: Platform.OS,
    };
    console.log("Body", body);

    try {
      const addRes = await addDevice(body);
      const sensors = extractSensorsFromAddResponse(addRes);
      await sendWifiConfigToESP(device);
      let layout: any = null;
      try {
        layout = await getLayout(deviceMac);
      } catch {}
      const sid = serviceIdFromLayout || layout?.serviceId || "";
      if (sid) {
        const buttons = await getLayoutButtonsByServiceId(sid);
        if (buttons.length) {
          await setLastLayout(
            deviceMac,
            buttons.map((b) => ({
              pin: b.pin,
              label: b.label,
              type: b.type,
              command: b.command,
            })),
          );
        }
      }
      Alert.alert(
        "Success",
        `Switchboard "${name.trim()}" added successfully!`
      );
      navigation.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "Switchboard",
            params: {
              switchboardName: name.trim(),
              deviceId: deviceMac,
              roomIcon: roomIcon || "",
              status: true,
              iosBleId: Platform.OS === "ios" ? device.id : undefined,
              bleId: device.id,
              service_id: serviceIdFromLayout || layout?.serviceId || "",
              roomName: roomName || "",
              sensors,
            },
          },
        ],
      });
    } catch (err) {
      console.log(err);
      Alert.alert("Error", `Failed to add "${name.trim()}" switchboard!`);
    } finally {
      await clearPendingSwitchboardDeviceId();
      setLoading(false);
    }
  };

  if (step === "scan") {
    return (
      <View style={styles.container}>
        <Toast
          visible={toast.visible}
          message={toast.message}
          duration={2000}
          onHide={() => setToast({ ...toast, visible: false })}
        />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Scan Switchboard</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scanScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor="#fff"
            />
          }
        >
        <View style={styles.scanContent}>
          <TouchableOpacity
            style={styles.scanIconWrapper}
            onPress={handleBleIconRefresh}
            activeOpacity={0.8}
            disabled={scanning}
          >
            {scanning && (
              <>
                <Animated.View
                  style={[
                    styles.scanRing,
                    {
                      opacity: ring1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                      transform: [{ scale: ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.scanRing,
                    {
                      opacity: ring2.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                      transform: [{ scale: ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
                    },
                  ]}
                />
              </>
            )}
            <View style={styles.scanIcon}>
              <Bluetooth size={28} color="#3b82f6" />
            </View>
          </TouchableOpacity>

          <Text style={styles.scanTitle}>
            {scanning ? "Scanning for devices..." : "Nearby Devices"}
          </Text>
          <Text style={styles.scanSubtitle}>
            {scanning
              ? "Please wait while we search for switchboards"
              : "Select a switchboard to connect"}
          </Text>

          {!scanning && devices.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No devices found</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setScanning(true);
                  setStep("scan");
                  setDevices([]);
                  runScan();
                }}
              >
                <Text style={styles.retryButtonText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {sortedDevices.length > 0 && (
            <ScrollView style={styles.deviceList}>
              {sortedDevices.map((dev) => {
                const isAdded = existingDeviceIds.has(
                  String(dev.canonicalId || dev.id).toUpperCase()
                );
                return (
                  <TouchableOpacity
                    key={dev.id}
                    style={[styles.deviceCard, isAdded && styles.deviceCardAdded]}
                    onPress={() => !isAdded && handleDeviceSelect(dev)}
                    activeOpacity={isAdded ? 1 : 0.7}
                    disabled={isAdded}
                  >
                    <View style={styles.deviceInfo}>
                      <Bluetooth size={20} color={isAdded ? "#475569" : "#3b82f6"} />
                      <View style={styles.deviceDetails}>
                        <Text style={[styles.deviceName, isAdded && styles.deviceNameAdded]}>
                          {dev.canonicalId || dev.id}
                        </Text>
                        <Text style={styles.deviceSignal}>
                          Signal: {formatRssi(dev.rssi)}
                        </Text>
                        <Text style={styles.deviceSignal}>
                          Approx distance: {estimateDistanceMeters(dev.rssi)}
                        </Text>
                      </View>
                    </View>
                    {isAdded ? (
                      <View style={styles.addedTag}>
                        <Text style={styles.addedTagText}>Added</Text>
                      </View>
                    ) : (
                      <Text style={styles.connectText}>Connect</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.manualButton}
            onPress={() => {
              setStep("scan");
              runScan();
            }}
          >
            <Text style={styles.manualButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep("scan")}>
          <Text style={styles.cancelButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Configure Switchboard</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.label}>Switchboard Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Main Panel"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
          autoFocus
          editable={!loading}
        />

        <Text style={styles.sectionTitle}>WiFi Configuration (Optional)</Text>
        <Text style={styles.sectionSubtitle}>
          Configure WiFi settings for smart switchboard
        </Text>

        <Text style={styles.label}>WiFi Network Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Network SSID"
          placeholderTextColor="#64748b"
          value={wifiSSID}
          onChangeText={setWifiSSID}
          editable={!loading}
        />

        <Text style={styles.label}>WiFi Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#64748b"
          value={wifiPassword}
          onChangeText={setWifiPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddSwitchboard}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Switchboard</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  cancelButton: {
    color: "#3b82f6",
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  placeholder: {
    width: 60,
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 24,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
  },
  button: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 32,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scanContent: {
    flex: 1,
    padding: 24,
    paddingTop: 12,
    alignItems: "center",
  },
  scanScrollContent: {
    flexGrow: 1,
  },
  scanIconWrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  scanRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#3b82f6",
  },
  scanIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1e3a8a",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  scanSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 24,
  },
  emptyText: {
    fontSize: 16,
    color: "#64748b",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#334155",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  deviceList: {
    width: "100%",
    marginTop: 8,
  },
  deviceCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deviceDetails: {
    gap: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  deviceSignal: {
    fontSize: 12,
    color: "#94a3b8",
  },
  deviceCardAdded: {
    opacity: 0.5,
    borderColor: "#1e293b",
  },
  deviceNameAdded: {
    color: "#64748b",
  },
  addedTag: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addedTagText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  connectText: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "600",
  },
  manualButton: {
    marginTop: "auto",
    paddingVertical: 16,
  },
  manualButtonText: {
    color: "#3b82f6",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
