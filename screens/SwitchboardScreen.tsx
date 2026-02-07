import {
  attachSensorToDevice,
  checkSensorAttachment,
  createSensorRule,
  detachSensorFromDevice,
  fetchPinConfigs,
  getDeviceStatusOverWifi,
  getLayout,
  savePinConfig,
  sendCommandOverWifi,
  WifiPayload,
} from "@/api/devics";
import HingeSlider from "@/components/HingeSlider";
import { DATA_CHAR_UUID, ROOM_ICONS } from "@/constants";
import { RootStackParamList } from "@/constants/types";
import { getLayoutButtonsByServiceId } from "@/db/layout_buttons";
import {
  getPendingPinConfigs,
  getPinConfigsByDevice,
  markPinConfigSynced,
  upsertPinConfigLocal,
} from "@/db/pin_configs";
import BLEManagerService from "@/services/bleManager";
import {
  addIgnoredSensor,
  clearIgnoredSensors,
  getIgnoredSensors,
  getLastLayout,
  setLastLayout,
} from "@/utils/storage";
import { loadWifi, saveWifi } from "@/utils/wifiCreds";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp } from "@react-navigation/native";
import { Buffer } from "buffer";
import {
  ChevronLeft,
  Lightbulb,
  Power,
  Settings,
  SlidersHorizontal,
  Wifi,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Device as BleDevice } from "react-native-ble-plx";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";
import CustomSlider from "../components/CustomSlider";

interface Device {
  id: number;
  name: string;
  device_type: string;
  position: number;
  is_on: boolean;
  brightness?: number;
  color?: string;
  speed?: number;
  command: string;
}

const COLOR_PALETTE = [
  "rgb(91, 141, 239)",
  "rgb(124, 111, 216)",
  "rgb(74, 222, 128)",
  "rgb(251, 191, 36)",
  "rgb(239, 68, 68)",
  "rgb(236, 72, 153)",
  "rgb(94, 234, 212)",
  "rgb(251, 146, 60)",
];

const FAN_SPEED_LEVELS = [30, 45, 60, 75, 90, 100];

type Props = {
  route: RouteProp<RootStackParamList, "Switchboard">;
  navigation: any;
};
type Disposable = { remove?: () => void; unsubscribe?: () => void };

export default function SwitchboardScreen({ route, navigation }: Props) {
  const bleManagerRef = React.useRef<BLEManagerService>(null);
  if (!bleManagerRef.current) bleManagerRef.current = new BLEManagerService();
  const bleManager = bleManagerRef.current;

  const {
    switchboardName,
    service_id,
    deviceId,
    roomIcon,
    status,
    iosBleId,
    bleId,
  } = route.params;
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<BleDevice>();
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [tempColor, setTempColor] = useState("rgb(91, 141, 239)");
  const [tempIntensity, setTempIntensity] = useState(80);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showSensorConfigModal, setShowSensorConfigModal] = useState(false);
  const [showPinConfigModal, setShowPinConfigModal] = useState(false);
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [pins, setPins] = useState<any>({});
  const lastBlePinsAtRef = React.useRef<number>(0);
  const lastSensorListRef = React.useRef<string>("");
  const lastSensorCheckRef = React.useRef<number>(0);
  const resolvingBleRef = React.useRef<boolean>(false);
  const connectingBleRef = React.useRef<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(status);
  const [isWifiOnline, setIsWifiOnline] = useState<boolean>(status);
  const [speed, setSpeed] = useState(0);
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [showSensorModal, setShowSensorModal] = useState(false);
  const [pendingSensor, setPendingSensor] = useState<string | null>(null);
  const [sensorStep, setSensorStep] = useState<"prompt" | "attached">("prompt");
  const [ignoredSensors, setIgnoredSensors] = useState<string[]>([]);
  const [attachedSensors, setAttachedSensors] = useState<string[]>([]);
  const [pinConfigs, setPinConfigs] = useState<Record<number, any>>({});
  const rotation = React.useRef(new Animated.Value(0)).current;
  const [serviceId, setServiceId] = useState(service_id || "");
  const sheetTranslateY = React.useRef(new Animated.Value(0)).current;

  const monitorRef = React.useRef<Disposable | null>(null);
  const disconnectRef = React.useRef<Disposable | null>(null);
  const mountedRef = React.useRef(true);

  const IconComponent = ROOM_ICONS[roomIcon] ?? ROOM_ICONS["home"];

  const levelToPercent = (level: number) =>
    FAN_SPEED_LEVELS[Math.max(0, Math.min(5, Math.round(level)))];

  useEffect(() => {
    console.log("SwitchboardScreen mounted", {
      deviceId,
      service_id,
      bleId,
      iosBleId,
      status,
    });
    return () => {
      // on unmount
      mountedRef.current = false;
      monitorRef.current?.remove?.();
      monitorRef.current?.unsubscribe?.();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    getIgnoredSensors(deviceId).then(setIgnoredSensors);
  }, [deviceId]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [rotation]);

  const closeSheet = React.useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 320,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      sheetTranslateY.setValue(0);
      setShowSensorModal(false);
    });
  }, [sheetTranslateY]);

  const sheetPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 80) {
            closeSheet();
            return;
          }
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeSheet, sheetTranslateY],
  );

  const teardownBle = React.useCallback(() => {
    monitorRef.current?.remove?.();
    monitorRef.current?.unsubscribe?.();
    monitorRef.current = null;
  }, []);

  useEffect(() => {
    // BLE online should reflect actual BLE connection state
    if (!activeDevice || !services.length) {
      setIsOnline(false);
    } else {
      setIsOnline(true);
    }
  }, [activeDevice, services.length]);

  useEffect(() => {
    loadSwitchboardData();
  }, [deviceId, serviceId]);

  useEffect(() => {
    console.log("BLE state", {
      activeDevice: activeDevice?.id,
      services,
      isOnline,
    });
    if (!activeDevice || !services.length || !isOnline) return;
    teardownBle();
    console.log(
      "BLE subscribe",
      "device",
      activeDevice.id,
      "service",
      services[0],
    );

    const onReceived = (data: any) => {
      if (!data || typeof data !== "string") return;
      const raw = data.trim();
      console.log("BLE RX", raw);
      if (raw.startsWith("SENSORS:")) {
        const list = raw
          .replace("SENSORS:", "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const key = list.join(",");
        const now = Date.now();
        const minGapMs = 10000;
        if (
          key !== lastSensorListRef.current ||
          now - lastSensorCheckRef.current > minGapMs
        ) {
          lastSensorListRef.current = key;
          lastSensorCheckRef.current = now;
          handleAvailableSensors(list);
        } else {
          console.log("Skipping duplicate SENSORS payload");
        }
        return;
      }
      if (raw.startsWith("SENSORS_ATTACHED:")) {
        const list = raw
          .replace("SENSORS_ATTACHED:", "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        handleAttachedSensors(list);
        return;
      }
      if (raw.startsWith("SENSOR_ATTACH_")) {
        return;
      }

      const payload = raw.startsWith("PINS:") ? raw.slice(5).trim() : raw;
      if (!payload.includes(":")) {
        console.log("BLE non-pin payload", payload);
        return;
      }
      const pinDataArray = payload.includes(",")
        ? payload.split(",")
        : [payload];
      const pinObj: any = {};
      pinDataArray.forEach((pinData: string) => {
        const statusData: string[] = pinData.split(":");
        const pin = Number(statusData[0]);
        if (!Number.isFinite(pin) || statusData.length < 2) return;
        pinObj[pin] = statusData[1] === "1" ? true : false;
      });
      if (!Object.keys(pinObj).length) {
        console.log("BLE pins parse failed", payload);
        return;
      }
      console.log("BLE pins decoded", pinObj);
      lastBlePinsAtRef.current = Date.now();
      setPins(pinObj);
    };

    const onError = (err: any) => {
      console.warn("BLE monitor error", err?.message || err);
      teardownBle();
      if (mountedRef.current) {
        setIsOnline(false);
        setServices([]);
        setActiveDevice(undefined);
      }
    };

    monitorRef.current = bleManager.subscribeToData(
      activeDevice,
      services[0],
      onReceived,
      onError,
    ) as unknown as Disposable;
    getCurrentState(activeDevice, services[0]);

    try {
      // @ts-ignore – many ble managers follow this pattern
      const dsub = bleManager.onDeviceDisconnected?.(activeDevice.id, () => {
        teardownBle();
        if (mountedRef.current) {
          setIsOnline(false);
          setServices([]);
          setActiveDevice(undefined);
        }
      }) as Disposable | undefined;
      if (dsub) {
        // drop previous disconnect listener
        disconnectRef.current?.remove?.();
        disconnectRef.current?.unsubscribe?.();
        disconnectRef.current = dsub;
      }
    } catch {}

    return () => {
      teardownBle();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
      disconnectRef.current = null;
    };
  }, [activeDevice, services, isOnline]);

  const onReceivedOverWifi = (pins: any) => {
    const pinsData = pins;
    const pinObj: any = {};
    Object.keys(pinsData).forEach((pin: string) => {
      const n = Number(pin);
      if (!Number.isFinite(n)) return;
      pinObj[n] = pinsData[pin] == 1 ? true : false;
    });
    console.log("WiFi pins", pinObj);
    const bleStaleMs = 8000;
    const bleStale =
      !lastBlePinsAtRef.current ||
      Date.now() - lastBlePinsAtRef.current > bleStaleMs;
    // BLE has priority; apply Wi-Fi if BLE not connected or BLE pins stale
    if (!activeDevice || !services.length || !isOnline || bleStale) {
      setPins(pinObj);
    }
  };
  useEffect(() => {
    if (!pins || Object.keys(pins).length === 0) return;

    setDevices((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        const p = pins[d.id];
        if (p === undefined) return d;
        const is_on = p;

        if (d.is_on === is_on) return d;
        changed = true;
        return { ...d, is_on };
      });

      return changed ? next : prev;
    });
  }, [pins]);

  const loadSwitchboardData = async () => {
    setLoading(true);

    try {
      // 1️⃣ service_id is ALWAYS available

      // 2️⃣ LOAD FROM LOCAL (always)
      const effectiveServiceId = serviceId || service_id || "";
      let localButtons = await getLayoutButtonsByServiceId(effectiveServiceId);

      // 3️⃣ Render immediately if available
      if (localButtons.length > 0) {
        setDevices(
          localButtons.map((button, idx) => ({
            id: button.pin,
            name: button.label,
            device_type: button.type,
            is_on: false,
            position: idx,
            command: button.command,
          })),
        );
      } else {
        const cachedLayout = await getLastLayout(deviceId);
        if (cachedLayout?.length) {
          setDevices(
            cachedLayout.map((button: any, idx: number) => ({
              id: button.pin,
              name: button.label,
              device_type: button.type,
              is_on: false,
              position: idx,
              command: button.command,
            })),
          );
        }
      }

      // 4️⃣ BACKGROUND API SYNC (always)
      getLayout(deviceId)
        .then(async ({ serviceId: updatedServiceId }) => {
          if (updatedServiceId && updatedServiceId !== serviceId) {
            setServiceId(updatedServiceId);
          }
          const sid = updatedServiceId || serviceId || service_id || "";
          const updatedButtons = await getLayoutButtonsByServiceId(sid);
          if (updatedButtons.length) {
            await setLastLayout(
              deviceId,
              updatedButtons.map((b) => ({
                pin: b.pin,
                label: b.label,
                type: b.type,
                command: b.command,
              })),
            );
            setDevices(
              updatedButtons.map((button, idx) => ({
                id: button.pin,
                name: button.label,
                device_type: button.type,
                is_on: false,
                position: idx,
                command: button.command,
              })),
            );
          }
        })
        .catch((err) => {
          console.warn("Layout sync failed:", err);
        });

      // 5️⃣ Non-blocking side calls
      loadWifiStatusData();
      getBleConnection(deviceId);
    } catch (err) {
      console.error("Failed to load switchboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadWifiStatusData = async () => {
    try {
      const wifiStatus = await getDeviceStatusOverWifi(deviceId);
      if (wifiStatus) {
        setIsWifiOnline(wifiStatus?.status?.online);
        if (wifiStatus?.status?.online) {
          onReceivedOverWifi(wifiStatus.status.pins);
        }
      }
    } catch {
      // offline: keep cached pins
    }
  };
  const getCurrentState = async (device: BleDevice, serviceId: string) => {
    if (!device) return;
    try {
      const text = `REST:`;
      console.log("BLE getCurrentState -> sending", text);
      await bleManager.sendData(device, text, serviceId);
    } catch (e) {
      console.error("Write failed", e);
    }
  };

  const requestSensorRefresh = async () => {
    if (!services.length || !activeDevice) return;
    await getCurrentState(activeDevice, services[0]);
  };

  const loadPinConfigs = async () => {
    const local = await getPinConfigsByDevice(deviceId);
    if (local.length) {
      const map: Record<number, any> = {};
      local.forEach((c) => {
        map[c.pin] = {
          name: c.name,
          autoOn: !!c.auto_on,
          autoOff: !!c.auto_off,
          offDelay: c.off_delay || 600,
        };
      });
      setPinConfigs(map);
    }

    await syncPendingPinConfigs();

    try {
      const res = await fetchPinConfigs(deviceId);
      const list = res?.configs || [];
      if (list.length) {
        const map: Record<number, any> = {};
        for (const c of list) {
          map[c.pin] = {
            name: c.name || "",
            autoOn: !!c.auto_on,
            autoOff: !!c.auto_off,
            offDelay: c.off_delay || 600,
          };
          await upsertPinConfigLocal({
            device_mac: deviceId,
            pin: c.pin,
            name: c.name || "",
            auto_on: c.auto_on ? 1 : 0,
            auto_off: c.auto_off ? 1 : 0,
            off_delay: c.off_delay || 600,
            pending_sync: 0,
          });
        }
        setPinConfigs(map);
      }
    } catch {
      // offline: keep local
    }
  };

  const syncPendingPinConfigs = async () => {
    const pending = await getPendingPinConfigs();
    if (!pending.length) return;
    for (const cfg of pending) {
      try {
        await savePinConfig({
          device_mac: cfg.device_mac,
          pin: cfg.pin,
          name: cfg.name || "",
          auto_on: !!cfg.auto_on,
          auto_off: !!cfg.auto_off,
          off_delay: cfg.off_delay || 600,
        });
        await markPinConfigSynced(cfg.device_mac, cfg.pin);
      } catch {
        // keep pending
      }
    }
  };

  const updatePinConfig = (pin: number, patch: Partial<any>) => {
    setPinConfigs((prev) => {
      const current = prev[pin] || {
        name: "",
        autoOn: false,
        autoOff: false,
        offDelay: 600,
      };
      return { ...prev, [pin]: { ...current, ...patch } };
    });
  };

  const savePinConfigFor = async (pin: number) => {
    const cfg = pinConfigs[pin];
    if (!cfg) return;

    await upsertPinConfigLocal({
      device_mac: deviceId,
      pin,
      name: cfg.name || "",
      auto_on: cfg.autoOn ? 1 : 0,
      auto_off: cfg.autoOff ? 1 : 0,
      off_delay: cfg.offDelay || 600,
      pending_sync: 1,
    });

    try {
      await savePinConfig({
        device_mac: deviceId,
        pin,
        name: cfg.name || "",
        auto_on: !!cfg.autoOn,
        auto_off: !!cfg.autoOff,
        off_delay: cfg.offDelay || 600,
      });
      await markPinConfigSynced(deviceId, pin);
      Alert.alert("Saved", "Pin configuration saved.");
    } catch {
      Alert.alert("Saved offline", "Will sync when online.");
    }
  };

  const saveAllPinConfigs = async () => {
    const targetSensor = attachedSensors[0];
    for (const d of devices) {
      const cfg = pinConfigs[d.id] || {
        name: d.name || "",
        autoOn: false,
        autoOff: false,
        offDelay: 600,
      };
      await upsertPinConfigLocal({
        device_mac: deviceId,
        pin: d.id,
        name: cfg.name || "",
        auto_on: cfg.autoOn ? 1 : 0,
        auto_off: cfg.autoOff ? 1 : 0,
        off_delay: cfg.offDelay || 600,
        pending_sync: 1,
      });
      try {
        await savePinConfig({
          device_mac: deviceId,
          pin: d.id,
          name: cfg.name || "",
          auto_on: !!cfg.autoOn,
          auto_off: !!cfg.autoOff,
          off_delay: cfg.offDelay || 600,
        });
        await markPinConfigSynced(deviceId, d.id);
      } catch {
        // keep pending
      }

      if (targetSensor) {
        try {
          if (cfg.autoOn) {
            await createSensorRule(targetSensor, d.id, "active", "on");
          }
          if (cfg.autoOff) {
            await createSensorRule(
              targetSensor,
              d.id,
              "inactive",
              "off",
              cfg.offDelay || 600,
            );
          }
        } catch {
          // ignore rule errors
        }
      }
    }
    Alert.alert("Saved", "Pin configuration saved.");
    setShowPinConfigModal(false);
  };

  const handleAvailableSensors = async (list: string[]) => {
    if (!list.length) return;
    const unique = Array.from(new Set(list.map((s) => s.toUpperCase())));
    setAvailableSensors(unique);

    for (const mac of unique) {
      if (ignoredSensors.includes(mac)) {
        console.log("Sensor ignored locally", mac);
        continue;
      }
      try {
        console.log("Checking sensor attach status", mac);
        const res = await checkSensorAttachment(mac);
        console.log("Sensor attach status", mac, res);
        if (!res?.attached) {
          setPendingSensor(mac);
          setShowSensorModal(true);
          setSensorStep("prompt");
          return;
        }
      } catch {
        // fallback: show prompt if check fails (offline/timeout)
        console.log("Sensor attach check failed, showing prompt", mac);
        setPendingSensor(mac);
        setShowSensorModal(true);
        setSensorStep("prompt");
        return;
      }
    }
  };

  const handleAttachedSensors = (list: string[]) => {
    if (!list.length) return;
    const unique = Array.from(new Set(list.map((s) => s.toUpperCase())));
    setAttachedSensors(unique);
    // Do not auto-open popup for attached sensors.
  };

  const attachSensor = async () => {
    if (!pendingSensor) return;
    try {
      const apiRes = await attachSensorToDevice(deviceId, pendingSensor);
      console.log("Attach sensor API response", apiRes);
      console.log("Attach sensor API success");
      if (services.length && activeDevice) {
        const cmd = `SENSOR_ATTACH:${pendingSensor}`;
        console.log("Sending BLE attach command", cmd);
        await bleManager.sendData(activeDevice, cmd, services[0]);
        console.log("BLE attach command sent");
      }
      setShowSensorModal(false);
      setPendingSensor(null);
      await loadPinConfigs();
      setShowPinConfigModal(true);
    } catch (e: any) {
      console.error(
        "Attach sensor failed",
        e?.response?.status,
        e?.response?.data || e?.message || e,
      );
      Alert.alert("Failed", e?.response?.data?.message || "Attach failed");
      setShowSensorModal(false);
    } finally {
    }
  };

  const ignoreSensor = async () => {
    if (!pendingSensor) return;
    await addIgnoredSensor(deviceId, pendingSensor);
    setIgnoredSensors((prev) => Array.from(new Set([...prev, pendingSensor])));
    setShowSensorModal(false);
    setPendingSensor(null);
  };

  const resetIgnoredSensors = async () => {
    await clearIgnoredSensors(deviceId);
    setIgnoredSensors([]);
  };

  // pin configuration handled in separate full-screen modal

  const detachSensor = async (macOverride?: string) => {
    const targetMac = macOverride || pendingSensor;
    if (!targetMac) return;
    Alert.alert(
      "Remove Sensor",
      "This will detach the sensor from this hub and reset the sensor. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const apiRes = await detachSensorFromDevice(deviceId, targetMac);
              console.log("Detach sensor API response", apiRes);
              if (services.length && activeDevice) {
                const cmd = `SENSOR_DETACH:${targetMac}`;
                console.log("Sending BLE detach command", cmd);
                await bleManager.sendData(activeDevice, cmd, services[0]);
              }
              setAttachedSensors((prev) => prev.filter((s) => s !== targetMac));
              setShowSensorModal(false);
              setPendingSensor(null);
            } catch (e: any) {
              console.error(
                "Detach sensor failed",
                e?.response?.status,
                e?.response?.data || e?.message || e,
              );
              Alert.alert(
                "Failed",
                e?.response?.data?.message || "Detach failed",
              );
            }
          },
        },
      ],
    );
  };

  const getBleConnection = async (macAddress: string) => {
    try {
      if (connectingBleRef.current) return;
      connectingBleRef.current = true;
      let transportId = (bleId || iosBleId || "").toString();
      console.log("BLE step 1: start connect flow", {
        macAddress,
        bleId,
        iosBleId,
      });
      if (!transportId) {
        try {
          const keys = await AsyncStorage.getAllKeys();
          const canonicalKeys = keys.filter((k) =>
            k.startsWith("ble:canonical:"),
          );
          console.log(
            "BLE step 2: cached canonical keys",
            canonicalKeys.length,
          );
          for (const k of canonicalKeys) {
            const val = await AsyncStorage.getItem(k);
            if (val && val.toUpperCase() === macAddress.toUpperCase()) {
              transportId = k.replace("ble:canonical:", "");
              break;
            }
          }
        } catch {}
      }
      if (!transportId) transportId = (macAddress || "").toString();
      console.log("BLE step 3: transportId resolved", transportId);

      const targetId = transportId.toLowerCase();
      console.log("BLE connect", { macAddress, transportId });
      await bleManager.stopScan();
      await bleManager.cancelById(targetId);
      const already = await bleManager.getAlreadyConnected();
      console.log(
        "BLE step 4: already connected",
        already.map((d) => d.id),
      );
      let connected: BleDevice | null =
        already.find((d) => d.id.toLowerCase() === targetId) || null;
      if (activeDevice && activeDevice.id?.toLowerCase() === targetId) {
        connectingBleRef.current = false;
        return;
      }
      if (!connected) {
        console.log("BLE step 5: connectSafely");
        connected = await bleManager.connectSafely(targetId, {
          retries: 2,
          connectTimeoutMs: 5000,
          autoConnect: false,
          skipScan: false,
        });
        if (!connected) {
          console.warn("BLE step 5b: connectSafely returned null");
        }
      }

      if (connected) {
        console.log("BLE step 6: connected", connected.id);
        setIsOnline(true);
        setActiveDevice(connected);
        const serviceIds = await bleManager.getCustomServiceId(connected);
        console.log("BLE step 7: services", serviceIds);
        setServices(serviceIds);
      }
    } catch (err) {
      console.warn("BLE connect failed", err);
    } finally {
      connectingBleRef.current = false;
    }
  };

  const sendDataToESP = async (
    pin: number,
    command: string,
  ): Promise<boolean> => {
    if (!services.length || !activeDevice) {
      const payload: WifiPayload = {
        mac_address: deviceId,
        data: {
          cmd: command,
          pin: pin,
        },
      };
      const status = await sendCommandOverWifi(payload);
      return status;
    }

    try {
      const text = `PIN:${pin}:STATUS:${command}`;
      await bleManager.sendData(activeDevice, text, services[0]);
      return true;
    } catch (e) {
      console.error("Write failed", e);
      return false;
    }
  };

  const toggleDevice = async (deviceId: number) => {
    try {
      const dev = devices.find((d) => d.id === deviceId);
      if (!dev) return;
      const status = await sendDataToESP(dev.id, dev.command);
      if (status) {
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, is_on: !d.is_on } : d)),
        );
      }
    } catch (e) {
      // revert on failure
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, is_on: !d.is_on } : d)),
      );
    }
  };

  const openSettings = () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    setShowSettings(true);
    loadPinConfigs();
    requestSensorRefresh();
  };

  const applySettings = async () => {
    if (!tempColor) return;

    // @ts-ignore
    const selectedColor = tempColor?.match(/\d+/g).join(",");

    if (!services.length || !activeDevice) {
      // @ts-ignore
      const arr = tempColor.match(/\d+/g).map(Number);
      const payload: WifiPayload = {
        mac_address: deviceId,
        data: {
          cmd: "color",
          color: arr,
          brightness: tempIntensity,
        },
      };
      const status = await sendCommandOverWifi(payload);
      return status;
    }
    const text = `COLOR:${selectedColor};BRIGHTNESS:${tempIntensity}`;
    await bleManager.sendData(activeDevice, text, services[0]);

    setShowSettings(false);
  };

  const openWifiModal = async () => {
    const wifiCreds = await loadWifi();
    if (wifiCreds && wifiCreds.ssid) {
      setWifiSSID(wifiCreds.ssid);
      setWifiPassword(wifiCreds.pass);
    }
    setShowWifiModal(true);
  };

  const saveWifiConfig = async () => {
    if (!wifiSSID.trim()) {
      Alert.alert("Error", "Please enter a WiFi network name");
      return;
    }

    if (!wifiPassword.trim() || wifiPassword.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    await saveWifi(wifiSSID, wifiPassword);

    try {
      if (!services.length || !activeDevice) return;
      const text = `WIFI:${wifiSSID};${wifiPassword}`;
      await bleManager.safeWrite({
        device: activeDevice,
        serviceUUID: services[0],
        charUUID: DATA_CHAR_UUID,
        base64Payload: Buffer.from(text).toString("base64"),
      });
      //await bleManager.sendData(activeDevice, text, services[0]);
    } catch (err) {
      console.error("Error sending wifi creds", err);
    } finally {
      setShowWifiModal(false);
      Alert.alert("Success", "WiFi credentials sent to device");
    }
  };

  const sendFanSpeed = async (speed: number, device: Device) => {
    const val = Math.max(30, Math.min(100, Math.round(speed)));

    if (!services.length || !activeDevice) {
      // Wi-Fi fallback
      // const payload: WifiPayload = {
      //   mac_address: deviceId,
      //   data: { cmd: 'speed', pin: device.id, speed: clamped }
      // };
      // await sendCommandOverWifi(payload);
      return;
    }

    const text = `SPEED:${val};PIN:${device.id}`;

    await bleManager.sendData(activeDevice, text, services[0]);
  };

  const changeDeviceSpeed = React.useCallback(
    (device: Device, speed: number) => {
      const clamped = Math.max(0, Math.min(5, Math.round(speed)));
      const percent = levelToPercent(clamped);

      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.id === device.id);
        if (idx === -1) return prev;

        const old = prev[idx].speed ?? 0;
        const next = [...prev];
        next[idx] = {
          ...prev[idx],
          speed: clamped,
          is_on: clamped > 0 ? true : prev[idx].is_on,
        };

        (async () => {
          try {
            await sendFanSpeed(percent, device);
          } catch {
            // revert only that device
            setDevices((curr) => {
              const j = curr.findIndex((d) => d.id === device.id);
              if (j === -1) return curr;
              const copy = [...curr];
              copy[j] = { ...copy[j], speed: old };
              return copy;
            });
          }
        })();

        return next;
      });
    },
    [services.length, activeDevice],
  );

  const renderDeviceCard = (device: Device) => {
    const IconComponent = ROOM_ICONS[device.device_type] || Lightbulb;
    const isActive = device.is_on;
    const speedValue = device.speed ?? 0;
    const displayName = pinConfigs[device.id]?.name?.trim() || device.name;

    return (
      <View
        key={device.id}
        style={[styles.deviceCard, isActive && styles.deviceCardActive]}
      >
        <TouchableOpacity onPress={() => toggleDevice(device.id)}>
          <View style={isActive ? styles.glassOverlay : null} />
          <View
            style={[styles.deviceIcon, isActive && styles.deviceIconActive]}
          >
            <IconComponent
              size={26}
              color={isActive ? "#fff" : "#64748b"}
              strokeWidth={1.5}
            />
          </View>
          <View style={styles.deviceInfo}>
            <Text
              style={[
                styles.deviceButton,
                isActive && styles.deviceButtonActive,
              ]}
            >
              Button {device.position}
            </Text>
            <Text
              style={[styles.deviceName, isActive && styles.deviceNameActive]}
            >
              {displayName}
            </Text>
          </View>
          <View
            style={[
              styles.deviceStatus,
              { backgroundColor: isActive ? "#fff" : "#64748b" },
            ]}
          />
        </TouchableOpacity>

        {device.device_type === "fan" && (
          <View style={styles.speedControllerBox}>
            <View style={styles.sliderRow}>
              <Text style={styles.label}>Speed</Text>

              <HingeSlider
                value={speedValue}
                minimumValue={0}
                maximumValue={5}
                step={1}
                // live UI update (no network)
                onValueChange={(v: number) => {
                  const clamped = Math.max(0, Math.min(5, Math.round(v)));
                  setDevices((prev) =>
                    prev.map((d) =>
                      d.id === device.id
                        ? {
                            ...d,
                            speed: clamped,
                            is_on: clamped > 0 ? true : d.is_on,
                          }
                        : d,
                    ),
                  );
                }}
                // commit on release
                onSlidingComplete={(v: number) => changeDeviceSpeed(device, v)}
                trackHeight={20}
              />
            </View>
          </View>
        )}

        {/* {device.device_type === 'fan' && <View style={styles.speedControllerBox}>
          <View style={styles.sliderRow}>
            <Text style={styles.label}>Speed</Text>

            <HingeSlider
              value={localSpeed}
              minimumValue={0}
              maximumValue={5}
              step={1}
              onValueChange={(v) => setLocalSpeed(v)}
              onSlidingComplete={(v) => changeDeviceSpeed(device, v)}
              trackHeight={20}
            />
          </View>

          </View>} */}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={20} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton}>
            <Power size={20} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, showSettings && styles.iconButtonActive]}
            onPress={openSettings}
          >
            <Settings size={20} color={showSettings ? "#5b8def" : "#cbd5e1"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.boardHeader}>
          <View style={styles.boardInfo}>
            <Text style={styles.boardName}>
              {switchboardName || "Main Panel"}
            </Text>
            <View style={styles.boardStatus}>
              {isOnline && (
                <>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineText}>Ble Online</Text>
                </>
              )}

              {!isOnline && (
                <>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlineText}>Ble Offline</Text>
                </>
              )}

              <Text style={styles.separator}>|</Text>
              {isWifiOnline && (
                <>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineText}>Wifi Online</Text>
                </>
              )}
              {!isWifiOnline && (
                <>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlineText}>Wifi Offline</Text>
                </>
              )}
              <View style={styles.wifiContainer}>
                <Wifi size={14} color="#5b8def" strokeWidth={2} />
                <TouchableOpacity
                  style={styles.configureButton}
                  onPress={openWifiModal}
                >
                  <Text style={styles.configureText}>Configure WiFi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pinConfigIconBtn}
                  onPress={async () => {
                    await loadPinConfigs();
                    setShowPinConfigModal(true);
                  }}
                >
                  <SlidersHorizontal size={14} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={[styles.boardIcon]}>
            <IconComponent size={24} color="#5b8def" strokeWidth={2} />
          </View>
          {/* <View style={[styles.boardIcon, { backgroundColor: boardColor }]} /> */}
        </View>

        {/* settings moved to full-screen modal */}

        <View style={styles.devicesGrid}>
          {devices.map((device) => renderDeviceCard(device))}
        </View>
      </ScrollView>

      <Modal
        visible={showWifiModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWifiModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure WiFi</Text>
              <TouchableOpacity onPress={() => setShowWifiModal(false)}>
                <X size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Network Name (SSID)</Text>
              <TextInput
                style={styles.input}
                value={wifiSSID}
                onChangeText={setWifiSSID}
                placeholder="Enter WiFi network name"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={wifiPassword}
                onChangeText={setWifiPassword}
                placeholder="Enter WiFi password"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveWifiConfig}
            >
              <Text style={styles.saveButtonText}>Save Configuration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSensorModal}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View style={styles.sheetOverlay}>
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
            {...sheetPanResponder.panHandlers}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetContent}>
              {sensorStep === "prompt" && (
                <>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Motion Sensor Found</Text>
                    <TouchableOpacity onPress={closeSheet}>
                      <X size={22} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.sensorHero}>
                    <Animated.View
                      style={[
                        styles.sensorSpin,
                        {
                          transform: [
                            { perspective: 900 },
                            {
                              rotateY: rotation.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["0deg", "360deg"],
                              }),
                            },
                            { rotateX: "10deg" },
                          ],
                        },
                      ]}
                    >
                      <Svg width={160} height={160} viewBox="0 0 160 160">
                        <Defs>
                          <LinearGradient
                            id="front"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="1" stopColor="#e5e7eb" />
                          </LinearGradient>
                          <LinearGradient id="side" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor="#e5e7eb" />
                            <Stop offset="1" stopColor="#cbd5e1" />
                          </LinearGradient>
                          <LinearGradient id="top" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="1" stopColor="#f1f5f9" />
                          </LinearGradient>
                          <LinearGradient id="dome" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="0.6" stopColor="#d8e1ec" />
                            <Stop offset="1" stopColor="#b6c2d1" />
                          </LinearGradient>
                          <LinearGradient
                            id="gloss"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <Stop
                              offset="0"
                              stopColor="rgba(255,255,255,0.7)"
                            />
                            <Stop
                              offset="0.5"
                              stopColor="rgba(255,255,255,0.2)"
                            />
                            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
                          </LinearGradient>
                          <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#f8fafc" />
                            <Stop offset="1" stopColor="#cbd5e1" />
                          </LinearGradient>
                          <LinearGradient
                            id="baseShadow"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <Stop offset="0" stopColor="rgba(15,23,42,0.35)" />
                            <Stop offset="1" stopColor="rgba(15,23,42,0)" />
                          </LinearGradient>
                        </Defs>
                        {/* soft ground shadow */}
                        <Circle
                          cx="84"
                          cy="140"
                          r="26"
                          fill="url(#baseShadow)"
                        />
                        {/* thickness */}
                        <Polygon
                          points="22,18 34,28 134,28 122,18"
                          fill="url(#top)"
                        />
                        <Polygon
                          points="122,18 134,28 134,146 122,136"
                          fill="url(#side)"
                        />
                        {/* front plate */}
                        <Rect
                          x="22"
                          y="18"
                          width="100"
                          height="118"
                          rx="12"
                          fill="url(#front)"
                        />
                        {/* subtle inner border */}
                        <Rect
                          x="25"
                          y="21"
                          width="94"
                          height="112"
                          rx="10"
                          fill="none"
                          stroke="url(#edge)"
                        />
                        {/* sensor housing */}
                        <Rect
                          x="58"
                          y="54"
                          width="46"
                          height="46"
                          rx="7"
                          fill="#e9eef5"
                          stroke="#cbd5e1"
                        />
                        {/* dome */}
                        <Circle
                          cx="81"
                          cy="77"
                          r="18.5"
                          fill="url(#dome)"
                          stroke="#b6c2d1"
                        />
                        {/* dome highlight */}
                        <Circle
                          cx="75"
                          cy="70"
                          r="6"
                          fill="rgba(255,255,255,0.7)"
                        />
                        {/* gloss */}
                        <Rect
                          x="26"
                          y="20"
                          width="86"
                          height="30"
                          rx="9"
                          fill="url(#gloss)"
                        />
                        {/* dome dots */}
                        <Circle cx="74" cy="74" r="2" fill="#b6c2d1" />
                        <Circle cx="81" cy="72" r="2" fill="#b6c2d1" />
                        <Circle cx="88" cy="74" r="2" fill="#b6c2d1" />
                        <Circle cx="74" cy="81" r="2" fill="#b6c2d1" />
                        <Circle cx="81" cy="83" r="2" fill="#b6c2d1" />
                        <Circle cx="88" cy="81" r="2" fill="#b6c2d1" />
                      </Svg>
                    </Animated.View>
                  </View>
                  <Text style={styles.sheetText}>
                    Sensor {pendingSensor} is nearby. Do you want to attach it
                    to this switchboard?
                  </Text>
                  <View style={styles.sheetActions}>
                    <TouchableOpacity
                      style={[styles.sheetBtn, styles.sheetBtnGhost]}
                      onPress={ignoreSensor}
                    >
                      <Text style={styles.sheetBtnGhostText}>Ignore</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                      onPress={attachSensor}
                    >
                      <Text style={styles.sheetBtnPrimaryText}>Attach</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* pin configuration moved to full-screen modal */}

              {sensorStep === "attached" && (
                <>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Sensor Attached</Text>
                    <TouchableOpacity onPress={closeSheet}>
                      <X size={22} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.sensorHero}>
                    <Animated.View
                      style={[
                        styles.sensorSpin,
                        {
                          transform: [
                            { perspective: 900 },
                            {
                              rotateY: rotation.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["0deg", "360deg"],
                              }),
                            },
                            { rotateX: "10deg" },
                          ],
                        },
                      ]}
                    >
                      <Svg width={160} height={160} viewBox="0 0 160 160">
                        <Defs>
                          <LinearGradient
                            id="front"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="1" stopColor="#e5e7eb" />
                          </LinearGradient>
                          <LinearGradient id="side" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor="#e5e7eb" />
                            <Stop offset="1" stopColor="#cbd5e1" />
                          </LinearGradient>
                          <LinearGradient id="top" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="1" stopColor="#f1f5f9" />
                          </LinearGradient>
                          <LinearGradient id="dome" x1="0" y1="0" x2="1" y2="1">
                            <Stop offset="0" stopColor="#ffffff" />
                            <Stop offset="0.6" stopColor="#d8e1ec" />
                            <Stop offset="1" stopColor="#b6c2d1" />
                          </LinearGradient>
                          <LinearGradient
                            id="gloss"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <Stop
                              offset="0"
                              stopColor="rgba(255,255,255,0.7)"
                            />
                            <Stop
                              offset="0.5"
                              stopColor="rgba(255,255,255,0.2)"
                            />
                            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
                          </LinearGradient>
                          <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor="#f8fafc" />
                            <Stop offset="1" stopColor="#cbd5e1" />
                          </LinearGradient>
                          <LinearGradient
                            id="baseShadow"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <Stop offset="0" stopColor="rgba(15,23,42,0.35)" />
                            <Stop offset="1" stopColor="rgba(15,23,42,0)" />
                          </LinearGradient>
                        </Defs>
                        <Circle
                          cx="84"
                          cy="140"
                          r="26"
                          fill="url(#baseShadow)"
                        />
                        <Polygon
                          points="22,18 34,28 134,28 122,18"
                          fill="url(#top)"
                        />
                        <Polygon
                          points="122,18 134,28 134,146 122,136"
                          fill="url(#side)"
                        />
                        <Rect
                          x="22"
                          y="18"
                          width="100"
                          height="118"
                          rx="12"
                          fill="url(#front)"
                        />
                        <Rect
                          x="25"
                          y="21"
                          width="94"
                          height="112"
                          rx="10"
                          fill="none"
                          stroke="url(#edge)"
                        />
                        <Rect
                          x="58"
                          y="54"
                          width="46"
                          height="46"
                          rx="7"
                          fill="#e9eef5"
                          stroke="#cbd5e1"
                        />
                        <Circle
                          cx="81"
                          cy="77"
                          r="18.5"
                          fill="url(#dome)"
                          stroke="#b6c2d1"
                        />
                        <Circle
                          cx="75"
                          cy="70"
                          r="6"
                          fill="rgba(255,255,255,0.7)"
                        />
                        <Rect
                          x="26"
                          y="20"
                          width="86"
                          height="30"
                          rx="9"
                          fill="url(#gloss)"
                        />
                        <Circle cx="74" cy="74" r="2" fill="#b6c2d1" />
                        <Circle cx="81" cy="72" r="2" fill="#b6c2d1" />
                        <Circle cx="88" cy="74" r="2" fill="#b6c2d1" />
                        <Circle cx="74" cy="81" r="2" fill="#b6c2d1" />
                        <Circle cx="81" cy="83" r="2" fill="#b6c2d1" />
                        <Circle cx="88" cy="81" r="2" fill="#b6c2d1" />
                      </Svg>
                    </Animated.View>
                  </View>
                  <Text style={styles.sheetText}>
                    Sensor {pendingSensor} is attached to this hub. You can
                    remove it if needed.
                  </Text>
                  <TouchableOpacity
                    style={styles.dangerButton}
                    onPress={detachSensor}
                  >
                    <Text style={styles.dangerButtonText}>Remove Sensor</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={showSettings}
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.settingsModal}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Device Settings</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <X size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsBody}>
            <View style={styles.settingsCard}>
              <Text style={styles.sectionLabel}>LED Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_PALETTE.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color },
                      tempColor === color && styles.colorButtonSelected,
                    ]}
                    onPress={() => setTempColor(color)}
                  />
                ))}
              </View>
              <View
                style={[
                  styles.selectedColorPreview,
                  {
                    backgroundColor: tempColor,
                    opacity: tempIntensity / 100,
                  },
                ]}
              />
            </View>

            <View style={styles.settingsCard}>
              <Text style={styles.sectionLabel}>
                Brightness: {tempIntensity}%
              </Text>
              <CustomSlider
                value={tempIntensity}
                minimumValue={0}
                maximumValue={100}
                step={1}
                onValueChange={setTempIntensity}
                minimumTrackTintColor="#5b8def"
                maximumTrackTintColor="#334155"
                thumbTintColor="#5b8def"
              />
              <View style={styles.intensityLabels}>
                <Text style={styles.intensityLabel}>Off</Text>
                <Text style={styles.intensityLabel}>Dim</Text>
                <Text style={styles.intensityLabel}>Bright</Text>
              </View>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={applySettings}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsCard}>
              <View style={styles.settingsRow}>
                <Text style={styles.sectionLabel}>Sensor Configuration</Text>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={async () => {
                    await requestSensorRefresh();
                    await loadPinConfigs();
                  }}
                >
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {ignoredSensors.length > 0 && (
                <TouchableOpacity
                  style={styles.clearIgnoredBtn}
                  onPress={resetIgnoredSensors}
                >
                  <Text style={styles.clearIgnoredText}>
                    Clear Ignored Sensors
                  </Text>
                </TouchableOpacity>
              )}
              {attachedSensors.length === 0 && (
                <Text style={styles.sensorConfigEmpty}>
                  No sensors attached to this hub.
                </Text>
              )}
              {attachedSensors.map((mac) => (
                <View key={mac} style={styles.sensorRow}>
                  <Text style={styles.sensorMac}>{mac}</Text>
                  <TouchableOpacity
                    style={styles.sensorRemoveBtn}
                    onPress={() => detachSensor(mac)}
                  >
                    <Text style={styles.sensorRemoveText}>Detach</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.closeBigBtn}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeBigBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showPinConfigModal}
        animationType="slide"
        onRequestClose={() => setShowPinConfigModal(false)}
      >
        <View style={styles.settingsModal}>
          <View style={styles.settingsHeader}>
            <Text style={styles.settingsTitle}>Pin Configuration</Text>
            <TouchableOpacity onPress={() => setShowPinConfigModal(false)}>
              <X size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsBody}>
            <View style={styles.settingsCard}>
              <Text style={styles.sectionLabel}>Pin Motion Rules</Text>
              <Text style={styles.pinRulesHint}>
                Configure each pin: name, auto on/off, and timer.
              </Text>
              {devices.map((d) => {
                const cfg = pinConfigs[d.id] || {
                  name: pinConfigs[d.id]?.name || d.name || "",
                  autoOn: false,
                  autoOff: false,
                  offDelay: 600,
                };
                return (
                  <View key={d.id} style={styles.pinConfigCard}>
                    <View style={styles.pinConfigHeader}>
                      <Text style={styles.pinConfigTitle}>Pin {d.id}</Text>
                    </View>

                    <TextInput
                      style={styles.pinNameInput}
                      placeholder="Switch name"
                      placeholderTextColor="#64748b"
                      value={cfg.name}
                      onChangeText={(v) => updatePinConfig(d.id, { name: v })}
                    />

                    <View style={styles.pinOptionRow}>
                      <TouchableOpacity
                        style={[
                          styles.ruleOption,
                          cfg.autoOn && styles.ruleOptionActive,
                        ]}
                        onPress={() =>
                          updatePinConfig(d.id, { autoOn: !cfg.autoOn })
                        }
                      >
                        <Text
                          style={[
                            styles.ruleText,
                            cfg.autoOn && styles.ruleTextActive,
                          ]}
                        >
                          Auto On
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.ruleOption,
                          cfg.autoOff && styles.ruleOptionActive,
                        ]}
                        onPress={() =>
                          updatePinConfig(d.id, { autoOff: !cfg.autoOff })
                        }
                      >
                        <Text
                          style={[
                            styles.ruleText,
                            cfg.autoOff && styles.ruleTextActive,
                          ]}
                        >
                          Auto Off
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {cfg.autoOff && (
                      <View style={styles.durationRow}>
                        {[120, 600, 1800].map((sec) => (
                          <TouchableOpacity
                            key={sec}
                            style={[
                              styles.durationChip,
                              cfg.offDelay === sec && styles.durationChipActive,
                            ]}
                            onPress={() =>
                              updatePinConfig(d.id, { offDelay: sec })
                            }
                          >
                            <Text
                              style={[
                                styles.durationChipText,
                                cfg.offDelay === sec &&
                                  styles.durationChipTextActive,
                              ]}
                            >
                              {sec === 120
                                ? "2 min"
                                : sec === 600
                                  ? "10 min"
                                  : "30 min"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={saveAllPinConfigs}
            >
              <Text style={styles.applyButtonText}>Save All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeBigBtn}
              onPress={() => setShowPinConfigModal(false)}
            >
              <Text style={styles.closeBigBtnText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
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
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingRight: 10,
  },
  speedControllerBox: {
    flexDirection: "column",
  },
  speedController: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  speedInput: {
    height: 40,
    borderWidth: 1,
    padding: 10,
    marginBottom: 5,
    borderColor: "#fff",
    borderRadius: 5,
    color: "#fff",
  },
  sliderRow: { marginTop: 6 },
  label: { color: "#cbd5e1", fontSize: 13, marginBottom: 6 },
  speedMarks: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  mark: { color: "#64748b", fontSize: 12 },
  markActive: { color: "#fff", fontWeight: "700" },
  backText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  iconButtonActive: {
    borderColor: "#5b8def",
    borderWidth: 2,
  },
  content: {
    flex: 1,
  },
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#1e293b",
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pinConfigIconBtn: {
    marginLeft: 6,
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  boardInfo: {
    flex: 1,
  },
  boardName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  boardStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  onlineText: {
    fontSize: 14,
    color: "#10b981",
    fontWeight: "600",
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#b91010ff",
  },
  offlineText: {
    fontSize: 14,
    color: "#b91010ff",
    fontWeight: 600,
  },
  separator: {
    fontSize: 14,
    color: "#64748b",
    marginHorizontal: 4,
  },
  wifiContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(91, 141, 239, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(91, 141, 239, 0.4)",
    gap: 6,
  },
  configureButton: {
    paddingHorizontal: 4,
  },
  configureText: {
    fontSize: 13,
    color: "#5b8def",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
  },
  modalText: {
    color: "#e2e8f0",
    fontSize: 14,
    marginTop: 6,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 10,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  modalBtnPrimary: {
    backgroundColor: "#2563eb",
  },
  modalBtnSecondary: {
    backgroundColor: "#1f2937",
  },
  modalBtnTextPrimary: {
    color: "#fff",
    fontWeight: "600",
  },
  modalBtnTextSecondary: {
    color: "#e2e8f0",
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
  },
  saveButton: {
    backgroundColor: "#5b8def",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  boardIcon: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: "#fff",
    backgroundColor: "#2d3b52",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsPanel: {
    backgroundColor: "#1e293b",
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
  },
  colorSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  colorButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorButtonSelected: {
    borderColor: "#fff",
  },
  selectedColorPreview: {
    width: "100%",
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  intensitySection: {
    marginBottom: 0,
  },
  intensityLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 20,
  },
  intensityLabel: {
    fontSize: 13,
    color: "#94a3b8",
  },
  applyButton: {
    backgroundColor: "#5b8def",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#5b8def",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 16,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  devicesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
    marginBottom: 32,
  },
  deviceCard: {
    width: "47%",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    minHeight: 140,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    overflow: "hidden",
  },
  deviceCardActive: {
    backgroundColor: "rgb(70, 110, 190)",
    borderColor: "rgba(70, 110, 190, 0.6)",
    borderWidth: 1.5,
    shadowColor: "rgb(70, 110, 190)",
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  glassOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.3)",
  },
  deviceIconActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderColor: "rgba(255, 255, 255, 0.4)",
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceInfo: {
    marginBottom: 10,
  },
  deviceButton: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 4,
  },
  deviceButtonActive: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  deviceName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  deviceNameActive: {
    color: "#fff",
  },
  deviceStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: "absolute",
    top: 16,
    right: 16,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: "#1f2937",
    minHeight: 380,
    maxHeight: "85%",
  },
  sheetContent: {
    transform: [{ translateY: -20 }],
    paddingTop: 20,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#334155",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  sheetText: {
    color: "#cbd5e1",
    fontSize: 14,
    marginBottom: 16,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  sheetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  sheetBtnPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  sheetBtnGhost: {
    backgroundColor: "transparent",
    borderColor: "#334155",
  },
  sheetBtnPrimaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  sheetBtnGhostText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  dangerButton: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#ef4444",
    fontWeight: "700",
  },
  settingsModal: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingTop: 56,
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  settingsTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  settingsBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  settingsCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  refreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
  },
  refreshBtnText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  pinRulesHint: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 10,
  },
  pinConfigCard: {
    backgroundColor: "#0b1220",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  pinConfigHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pinConfigTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
  },
  savePinBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
  },
  savePinBtnText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  pinNameInput: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#fff",
    marginBottom: 10,
  },
  pinOptionRow: {
    flexDirection: "row",
    gap: 10,
  },
  clearIgnoredBtn: {
    alignSelf: "flex-start",
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#0b1220",
  },
  clearIgnoredText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  closeBigBtn: {
    backgroundColor: "#1f2937",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 60,
  },
  closeBigBtnText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 15,
  },
  sensorConfigSub: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 12,
  },
  sensorConfigEmpty: {
    color: "#64748b",
    fontSize: 14,
  },
  sensorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  sensorMac: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
  },
  sensorRemoveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.5)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  sensorRemoveText: {
    color: "#ef4444",
    fontWeight: "700",
  },
  sensorHero: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sensorSpin: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  ruleRow: {
    gap: 10,
    marginTop: 8,
  },
  ruleOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
  },
  ruleOptionActive: {
    borderColor: "#2563eb",
    backgroundColor: "rgba(37, 99, 235, 0.15)",
  },
  ruleText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  ruleTextActive: {
    color: "#93c5fd",
  },
  durationRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  durationChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
  },
  durationChipActive: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  durationChipText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  durationChipTextActive: {
    color: "#86efac",
  },
});
