import {
  attachSensorToDevice,
  checkSensorAttachment,
  createSensorRule,
  detachSensorFromDevice,
  fetchDevicesByMac,
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
import { useToast } from "@/contexts/ToastContext";
import { getLayoutButtonsByServiceId } from "@/db/layout_buttons";
import {
  getPendingPinConfigs,
  getPinConfigsByDevice,
  markPinConfigSynced,
  upsertPinConfigLocal,
} from "@/db/pin_configs";
import {
  getSwitchboardsLocal,
  updateSwitchboardSensorsLocal,
} from "@/db/switchboards.local";
import BLEManagerService from "@/services/bleManager";
import { getCanonicalId } from "@/services/bleCanonicalId";
import {
  addIgnoredSensor,
  clearIgnoredSensors,
  getIgnoredSensors,
  getLastLayout,
  updateDeviceSensorsInCachedLists,
  setLastLayout,
} from "@/utils/storage";
import { loadWifi, saveWifi } from "@/utils/wifiCreds";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp, useIsFocused } from "@react-navigation/native";
import { Buffer } from "buffer";
import {
  Bluetooth,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Power,
  Settings,
  SlidersHorizontal,
  Wifi,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Alert,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
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
  pin_status_ble?: boolean | null;
  pin_status_wifi?: boolean | null;
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
const DEFAULT_EXCLUDE_START = 22;
const DEFAULT_EXCLUDE_END = 7;
const DEFAULT_LOAD_WATT = 0;
const HOUR_CHIP_MIN_WIDTH = 64;
const HOUR_CHIP_GAP = 8;

const formatHourLabel = (hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
};

const clampWatt = (value: number) => Math.min(250, Math.max(0, value));
const getHourScrollOffset = (hour: number) =>
  Math.max(0, hour * (HOUR_CHIP_MIN_WIDTH + HOUR_CHIP_GAP) - 16);

const formatExcludeSummary = (start: number, end: number) =>
  `${formatHourLabel(start)} - ${formatHourLabel(end)}`;

const normalizeSensorMacs = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((v) =>
            String(v || "")
              .trim()
              .toUpperCase(),
          )
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

const isMacAddress = (value: string) =>
  /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(String(value || "").trim());

const isLikelySensorMac = (value: string) =>
  /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(String(value || "").trim());

type Props = {
  route: RouteProp<RootStackParamList, "Switchboard">;
  navigation: any;
};
type Disposable = { remove?: () => void; unsubscribe?: () => void };

const CardLoadingOverlay = () => {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const loadingOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.34],
  });
  const sweepTranslateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });

  return (
    <Animated.View style={[styles.deviceLoadingOverlay, { opacity: loadingOpacity }]}>
      <Animated.View
        style={[
          styles.deviceLoadingSweep,
          { transform: [{ translateX: sweepTranslateX }] },
        ]}
      />
    </Animated.View>
  );
};

export default function SwitchboardScreen({ route, navigation }: Props) {
  const bleManagerRef = React.useRef<BLEManagerService>(null);
  if (!bleManagerRef.current) bleManagerRef.current = new BLEManagerService();
  const bleManager = bleManagerRef.current;
  const isFocused = useIsFocused();

  const {
    switchboardName,
    service_id,
    deviceId,
    roomIcon,
    status,
    iosBleId,
    bleId,
    sensors: initialSensors,
  } = route.params;
  const initialDeviceMac = String(deviceId || "")
    .trim()
    .toUpperCase();
  const [resolvedDeviceMac, setResolvedDeviceMac] = useState(initialDeviceMac);
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
  const [blePinsReceived, setBlePinsReceived] = useState(false);
  const lastSensorListRef = React.useRef<string>("");
  const lastSensorCheckRef = React.useRef<number>(0);
  const resolvingBleRef = React.useRef<boolean>(false);
  const connectingBleRef = React.useRef<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(status);
  const [isWifiOnline, setIsWifiOnline] = useState<boolean>(status);
  const [pendingToggleById, setPendingToggleById] = useState<
    Record<number, boolean>
  >({});

  const applyPinStateSnapshot = React.useCallback(
    (pinObj: Record<number, boolean>, source: "ble" | "wifi") => {
      if (!Object.keys(pinObj).length) return;
      setDevices((prev) =>
        prev.map((d) => {
          if (pinObj[d.id] === undefined) return d;
          const actual = !!pinObj[d.id];
          return {
            ...d,
            is_on: actual,
            pin_status_ble: source === "ble" ? actual : d.pin_status_ble,
            pin_status_wifi: source === "wifi" ? actual : d.pin_status_wifi,
          };
        }),
      );
    },
    [],
  );
  const [speed, setSpeed] = useState(0);
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [showSensorModal, setShowSensorModal] = useState(false);
  const [pendingSensor, setPendingSensor] = useState<string | null>(null);
  const [sensorStep, setSensorStep] = useState<"prompt" | "attached">("prompt");
  const [ignoredSensors, setIgnoredSensors] = useState<string[]>([]);
  const [attachedSensors, setAttachedSensors] = useState<string[]>(
    Array.isArray(initialSensors) ? initialSensors : [],
  );
  const [pinConfigs, setPinConfigs] = useState<Record<number, any>>({});
  const [expandedPinId, setExpandedPinId] = useState<number | null>(null);
  const [ruleTabs, setRuleTabs] = useState<Record<number, "on" | "off">>({});
  const hourScrollRefs = React.useRef<Record<string, ScrollView | null>>({});
  const [pinConfigBaseline, setPinConfigBaseline] = useState<
    Record<number, string>
  >({});
  const { showToast } = useToast();
  const rotation = React.useRef(new Animated.Value(0)).current;
  const [serviceId, setServiceId] = useState(service_id || "");
  const [discoveryState, setDiscoveryState] = useState<
    "unknown" | "checking" | "on" | "off"
  >("unknown");
  const sheetTranslateY = React.useRef(new Animated.Value(0)).current;

  const monitorRef = React.useRef<Disposable | null>(null);
  const disconnectRef = React.useRef<Disposable | null>(null);
  const mountedRef = React.useRef(true);
  const activeDeviceRef = React.useRef<BleDevice | undefined>(undefined);
  const prevFocusedRef = React.useRef<boolean>(false);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptsRef = React.useRef<number>(0);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  const IconComponent = ROOM_ICONS[roomIcon] ?? ROOM_ICONS["home"];
  const bleLog = (...args: any[]) =>
    console.log(
      `[SwitchboardBLE][${resolvedDeviceMac || initialDeviceMac}]`,
      ...args,
    );

  const levelToPercent = (level: number) =>
    FAN_SPEED_LEVELS[Math.max(0, Math.min(5, Math.round(level)))];
  const percentToLevel = (percent: number) => {
    const idx = FAN_SPEED_LEVELS.findIndex((value) => value === percent);
    if (idx >= 0) return idx;
    return FAN_SPEED_LEVELS.reduce(
      (bestIdx, value, index, arr) =>
        Math.abs(value - percent) < Math.abs(arr[bestIdx] - percent)
          ? index
          : bestIdx,
      0,
    );
  };

  useEffect(() => {
    return () => {
      // on unmount
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      bleLog("Unmount: tearing down BLE listeners");
      monitorRef.current?.remove?.();
      monitorRef.current?.unsubscribe?.();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    bleLog("Screen mount params", {
      status,
      bleId,
      iosBleId,
      service_id,
      switchboardName,
    });
  }, [bleId, iosBleId, service_id, status, switchboardName]);

  useEffect(() => {
    let cancelled = false;
    const resolveCanonicalMac = async () => {
      const routeMac = String(deviceId || "")
        .trim()
        .toUpperCase();
      let resolved = routeMac;
      const transportId = String(bleId || iosBleId || "").trim();

      if (transportId) {
        try {
          const cached = await AsyncStorage.getItem(
            `ble:canonical:${transportId}`,
          );
          const normalized = String(cached || "")
            .trim()
            .toUpperCase();
          if (normalized) {
            resolved = normalized;
          }
        } catch {}
      }

      if (!cancelled) {
        setResolvedDeviceMac(resolved || routeMac);
      }
    };

    resolveCanonicalMac();
    return () => {
      cancelled = true;
    };
  }, [bleId, iosBleId, deviceId]);

  useEffect(() => {
    getIgnoredSensors(resolvedDeviceMac).then(setIgnoredSensors);
  }, [resolvedDeviceMac]);

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

  useEffect(() => {
    loadPinConfigs();
  }, []);

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
    setBlePinsReceived(false);
  }, []);

  const scheduleReconnect = React.useCallback(
    (reason: string) => {
      if (!mountedRef.current || !isFocused) return;
      if (reconnectAttemptsRef.current >= 2) return;
      if (reconnectTimerRef.current) return;
      reconnectAttemptsRef.current += 1;
      bleLog("Scheduling BLE reconnect", {
        reason,
        attempt: reconnectAttemptsRef.current,
      });
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!mountedRef.current || !isFocused) return;
        getBleConnection(resolvedDeviceMac);
      }, 900);
    },
    [isFocused, resolvedDeviceMac],
  );

  const disconnectBleConnection = React.useCallback(async () => {
    try {
      teardownBle();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
      disconnectRef.current = null;

      if (activeDeviceRef.current) {
        bleLog("Disconnecting BLE device", {
          activeDeviceId: activeDeviceRef.current.id,
        });
        await bleManager.cancelDeviceConnection(activeDeviceRef.current);
      }
    } catch (e) {
      bleLog("disconnectBleConnection error", e);
    } finally {
      if (mountedRef.current) {
        setActiveDevice(undefined);
        setServices([]);
        setIsOnline(false);
      }
    }
  }, [bleManager, teardownBle]);

  useEffect(() => {
    activeDeviceRef.current = activeDevice;
    // BLE online should reflect BLE link state, not service discovery completeness.
    const nextOnline = !!activeDevice;
    bleLog("State sync", {
      activeDeviceId: activeDevice?.id,
      servicesCount: services.length,
      nextOnline,
    });
    setIsOnline(nextOnline);
  }, [activeDevice, services.length]);

  useEffect(() => {
    loadSwitchboardData();
  }, [resolvedDeviceMac, serviceId]);

  useEffect(() => {
    const wasFocused = prevFocusedRef.current;
    if (isFocused && !wasFocused) {
      prevFocusedRef.current = true;
      if (resolvedDeviceMac) {
        bleLog("Switchboard focused; ensuring BLE connection");
        getBleConnection(resolvedDeviceMac);
      }
      return;
    }
    if (!isFocused && wasFocused) {
      prevFocusedRef.current = false;
      disconnectBleConnection();
    }
  }, [isFocused, resolvedDeviceMac, disconnectBleConnection]);

  useEffect(() => {
    if (!activeDevice || !services.length) return;
    teardownBle();
    bleLog("Subscribing to BLE data", {
      activeDeviceId: activeDevice.id,
      serviceId: services[0],
    });

    const onReceived = (data: any) => {
      if (!data || typeof data !== "string") return;
      const messages = data
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      messages.forEach((raw) => {
        console.log("Printing Raw data");
        console.log(raw);
        if (raw.startsWith("SENSORS:")) {
        const list = raw
          .replace("SENSORS:", "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const validList = list.filter((s) => isLikelySensorMac(s));
        if (!validList.length && list.length) {
          console.log("Ignoring malformed SENSORS payload:", list);
          return;
        }
        const key = list.join(",");
        const now = Date.now();
        const minGapMs = 10000;
        if (
          key !== lastSensorListRef.current ||
          now - lastSensorCheckRef.current > minGapMs
        ) {
          lastSensorListRef.current = key;
          lastSensorCheckRef.current = now;
          handleAvailableSensors(validList);
        }
        return;
        }
        if (raw.startsWith("SENSORS_ATTACHED:")) {
        const list = raw
          .replace("SENSORS_ATTACHED:", "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const hasMalformed = list.some((s) => !isLikelySensorMac(s));
        if (hasMalformed) {
          console.log(
            "Ignoring malformed SENSORS_ATTACHED payload, syncing from backend:",
            list,
          );
          refreshAttachedSensorsFromBackend();
        } else {
          handleAttachedSensors(list);
        }
        return;
        }
        if (raw.startsWith("SENSOR_ATTACH_")) {
          return;
        }
        if (raw.startsWith("FAN_SPEED:")) {
        const parts = raw.split(":");
        const pin = Number(parts[1]);
        const power = Number(parts[2]);
        if (!Number.isFinite(pin) || !Number.isFinite(power)) {
          return;
        }
        const speedLevel = percentToLevel(power);
        setDevices((prev) =>
          prev.map((d) =>
            d.id !== pin
              ? d
              : {
                  ...d,
                  speed: speedLevel,
                  is_on: power > 0,
                  pin_status_ble: power > 0,
                },
          ),
        );
          return;
        }

        const payload = raw.startsWith("PINS:") ? raw.slice(5).trim() : raw;
        if (!payload.includes(":")) {
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
          return;
        }
        setBlePinsReceived(true);
        applyPinStateSnapshot(pinObj, "ble");
      });
    };

    const onError = (err: any) => {
      bleLog("BLE monitor error", err?.message || err);
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
        bleLog("Device disconnected callback", {
          activeDeviceId: activeDevice.id,
        });
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
      bleLog("BLE subscription cleanup", {
        activeDeviceId: activeDevice?.id,
        serviceId: services?.[0],
      });
      teardownBle();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
      disconnectRef.current = null;
    };
  }, [activeDevice, services]);

  const onReceivedOverWifi = React.useCallback((pins: any) => {
    const pinsData = pins;
    const pinObj: any = {};
    Object.keys(pinsData).forEach((pin: string) => {
      const n = Number(pin);
      if (!Number.isFinite(n)) return;
      pinObj[n] = pinsData[pin] == 1 ? true : false;
    });
    applyPinStateSnapshot(pinObj, "wifi");
  }, [applyPinStateSnapshot]);

  const loadSwitchboardData = async () => {
    setLoading(true);

    // Load sensors from local DB if not provided via route params
    if (!attachedSensors.length) {
      try {
        const allBoards = await getSwitchboardsLocal();
        const thisBoard = allBoards.find(
          (b) => b.id.toUpperCase() === resolvedDeviceMac.toUpperCase(),
        );
        if (thisBoard?.sensors) {
          const parsed = thisBoard.sensors
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (parsed.length) setAttachedSensors(parsed);
        }
      } catch {}
    }

    try {
      // 1️⃣ service_id is ALWAYS available

      // 2️⃣ LOAD FROM LOCAL (always)
      const effectiveServiceId = serviceId || service_id || "";
      let localButtons = await getLayoutButtonsByServiceId(effectiveServiceId);

      // 3️⃣ Render immediately if available
      if (localButtons.length > 0) {
        setDevices((prev) => {
          const prevById = new Map(prev.map((d) => [d.id, d]));
          return localButtons.map((button, idx) => {
            const prevDevice = prevById.get(button.pin);
            return {
              id: button.pin,
              name: button.label,
              device_type: button.type,
              is_on: prevDevice?.is_on ?? false,
              pin_status_ble: prevDevice?.pin_status_ble,
              pin_status_wifi: prevDevice?.pin_status_wifi,
              position: idx,
              command: button.command,
            };
          });
        });
      } else {
        const cachedLayout = await getLastLayout(resolvedDeviceMac);
        if (cachedLayout?.length) {
          setDevices((prev) => {
            const prevById = new Map(prev.map((d) => [d.id, d]));
            return cachedLayout.map((button: any, idx: number) => {
              const prevDevice = prevById.get(button.pin);
              return {
                id: button.pin,
                name: button.label,
                device_type: button.type,
                is_on: prevDevice?.is_on ?? false,
                pin_status_ble: prevDevice?.pin_status_ble,
                pin_status_wifi: prevDevice?.pin_status_wifi,
                position: idx,
                command: button.command,
              };
            });
          });
        }
      }

      // 4️⃣ BACKGROUND API SYNC (always)
      getLayout(resolvedDeviceMac)
        .then(async ({ serviceId: updatedServiceId }) => {
          if (updatedServiceId && updatedServiceId !== serviceId) {
            setServiceId(updatedServiceId);
          }
          const sid = updatedServiceId || serviceId || service_id || "";
          const updatedButtons = await getLayoutButtonsByServiceId(sid);
          if (updatedButtons.length) {
            await setLastLayout(
              resolvedDeviceMac,
              updatedButtons.map((b) => ({
                pin: b.pin,
                label: b.label,
                type: b.type,
                command: b.command,
              })),
            );
            setDevices((prev) => {
              const prevById = new Map(prev.map((d) => [d.id, d]));
              return updatedButtons.map((button, idx) => {
                const prevDevice = prevById.get(button.pin);
                return {
                  id: button.pin,
                  name: button.label,
                  device_type: button.type,
                  is_on: prevDevice?.is_on ?? false,
                  pin_status_ble: prevDevice?.pin_status_ble,
                  pin_status_wifi: prevDevice?.pin_status_wifi,
                  position: idx,
                  command: button.command,
                };
              });
            });
          }
        })
        .catch((err) => {});

      // 5️⃣ Non-blocking side calls
      loadWifiStatusData();
      refreshAttachedSensorsFromBackend();
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const loadWifiStatusData = React.useCallback(async () => {
    try {
      const wifiStatus = await getDeviceStatusOverWifi(resolvedDeviceMac);
      if (wifiStatus) {
        setIsWifiOnline(!!wifiStatus?.status?.online);
        if (wifiStatus?.status?.online && wifiStatus?.status?.pins) {
          onReceivedOverWifi(wifiStatus.status.pins);
        }
        return;
      }
      setIsWifiOnline(false);
    } catch {
      setIsWifiOnline(false);
      // offline: keep cached pins
    }
  }, [onReceivedOverWifi, resolvedDeviceMac]);

  useEffect(() => {
    if (!isFocused || !resolvedDeviceMac) return;

    void loadWifiStatusData();

    const intervalId = setInterval(() => {
      void loadWifiStatusData();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isFocused, loadWifiStatusData, resolvedDeviceMac]);
  const getCurrentState = async (device: BleDevice, serviceId: string) => {
    if (!device) return;
    try {
      const text = `REST:`;
      await bleManager.sendData(device, text, serviceId);
    } catch (e) {}
  };

  const delay = React.useCallback(
    (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    [],
  );

  const syncDeviceStates = React.useCallback(
    async (options?: { preferWifi?: boolean }) => {
      const useBle = !options?.preferWifi && !!activeDevice && services.length > 0;
      if (useBle && activeDevice) {
        await delay(80);
        await getCurrentState(activeDevice, services[0]);
        return;
      }

      for (const waitMs of [120, 320]) {
        await delay(waitMs);
        try {
          const wifiStatus = await getDeviceStatusOverWifi(resolvedDeviceMac);
          if (wifiStatus?.status?.online && wifiStatus?.status?.pins) {
            onReceivedOverWifi(wifiStatus.status.pins);
            return;
          }
        } catch {}
      }
    },
    [activeDevice, delay, onReceivedOverWifi, resolvedDeviceMac, services],
  );

  const requestSensorRefresh = async () => {
    if (!services.length || !activeDevice) return;
    await getCurrentState(activeDevice, services[0]);
  };

  const resolveApiDeviceMac = React.useCallback(async () => {
    const current = String(resolvedDeviceMac || "")
      .trim()
      .toUpperCase();
    if (isMacAddress(current)) return current;

    const candidates = Array.from(
      new Set(
        [
          String(bleId || "").trim(),
          String(iosBleId || "").trim(),
          String(deviceId || "").trim(),
          current,
        ].filter(Boolean),
      ),
    );

    for (const c of candidates) {
      try {
        const cached = await AsyncStorage.getItem(`ble:canonical:${c}`);
        const mac = String(cached || "")
          .trim()
          .toUpperCase();
        if (isMacAddress(mac)) return mac;
      } catch {}
    }

    return current;
  }, [bleId, deviceId, iosBleId, resolvedDeviceMac]);

  const persistAttachedSensors = React.useCallback(
    async (list: string[]) => {
      const normalized = normalizeSensorMacs(list);
      setAttachedSensors(normalized);
      await updateSwitchboardSensorsLocal(resolvedDeviceMac, normalized);
      await updateDeviceSensorsInCachedLists(resolvedDeviceMac, normalized);
    },
    [resolvedDeviceMac],
  );

  const refreshAttachedSensorsFromBackend = React.useCallback(async () => {
    try {
      const rows = await fetchDevicesByMac([resolvedDeviceMac]);
      if (!Array.isArray(rows) || rows.length === 0) return;
      const device = rows.find(
        (d) =>
          String(d?.device_id || "")
            .trim()
            .toUpperCase() === resolvedDeviceMac.toUpperCase(),
      );
      if (!device) return;
      const fromApi = normalizeSensorMacs(
        (device as any).sensors || (device as any).sensor_ids,
      );
      await persistAttachedSensors(fromApi);
    } catch {}
  }, [persistAttachedSensors, resolvedDeviceMac]);

  const loadPinConfigs = async () => {
    const local = await getPinConfigsByDevice(resolvedDeviceMac);
    if (local.length) {
      const map: Record<number, any> = {};
      const baseline: Record<number, string> = {};
      local.forEach((c) => {
        map[c.pin] = {
          name: c.name,
          autoOn: !!c.auto_on,
          autoOff: !!c.auto_off,
          offDelay: c.off_delay || 600,
          loadWatt: c.load_watt ?? DEFAULT_LOAD_WATT,
          onExcludeStartHour: c.on_exclude_start_hour ?? DEFAULT_EXCLUDE_START,
          onExcludeEndHour: c.on_exclude_end_hour ?? DEFAULT_EXCLUDE_END,
        };
        baseline[c.pin] = JSON.stringify(map[c.pin]);
      });
      setPinConfigs(map);
      setPinConfigBaseline(baseline);
    }

    await syncPendingPinConfigs();

    try {
      const res = await fetchPinConfigs(resolvedDeviceMac);
      const list = res?.configs || [];
      if (list.length) {
        const map: Record<number, any> = {};
        const baseline: Record<number, string> = {};
        for (const c of list) {
          map[c.pin] = {
            name: c.name || "",
            autoOn: !!c.auto_on,
            autoOff: !!c.auto_off,
            offDelay: c.off_delay || 600,
            loadWatt: c.load_watt ?? DEFAULT_LOAD_WATT,
            onExcludeStartHour:
              c.on_exclude_start_hour ?? DEFAULT_EXCLUDE_START,
            onExcludeEndHour: c.on_exclude_end_hour ?? DEFAULT_EXCLUDE_END,
          };
          baseline[c.pin] = JSON.stringify(map[c.pin]);
          await upsertPinConfigLocal({
            device_mac: resolvedDeviceMac,
            pin: c.pin,
            name: c.name || "",
            auto_on: c.auto_on ? 1 : 0,
            auto_off: c.auto_off ? 1 : 0,
            off_delay: c.off_delay || 600,
            load_watt: c.load_watt ?? DEFAULT_LOAD_WATT,
            on_exclude_start_hour:
              c.on_exclude_start_hour ?? DEFAULT_EXCLUDE_START,
            on_exclude_end_hour: c.on_exclude_end_hour ?? DEFAULT_EXCLUDE_END,
            pending_sync: 0,
          });
        }
        setPinConfigs(map);
        setPinConfigBaseline(baseline);
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
          load_watt: cfg.load_watt ?? DEFAULT_LOAD_WATT,
          on_exclude_start_hour:
            cfg.on_exclude_start_hour ?? DEFAULT_EXCLUDE_START,
          on_exclude_end_hour: cfg.on_exclude_end_hour ?? DEFAULT_EXCLUDE_END,
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
        loadWatt: DEFAULT_LOAD_WATT,
        onExcludeStartHour: DEFAULT_EXCLUDE_START,
        onExcludeEndHour: DEFAULT_EXCLUDE_END,
      };
      return { ...prev, [pin]: { ...current, ...patch } };
    });
  };

  const togglePinExpanded = (pin: number) => {
    setExpandedPinId((prev) => (prev === pin ? null : pin));
  };

  const setRuleTab = (pin: number, tab: "on" | "off") => {
    setRuleTabs((prev) => ({ ...prev, [pin]: tab }));
  };

  const savePinConfigFor = async (pin: number) => {
    const cfg = pinConfigs[pin];
    if (!cfg) return;

    await upsertPinConfigLocal({
      device_mac: resolvedDeviceMac,
      pin,
      name: cfg.name || "",
      auto_on: cfg.autoOn ? 1 : 0,
      auto_off: cfg.autoOff ? 1 : 0,
      off_delay: cfg.offDelay || 600,
      load_watt: cfg.loadWatt ?? DEFAULT_LOAD_WATT,
      on_exclude_start_hour: cfg.onExcludeStartHour ?? DEFAULT_EXCLUDE_START,
      on_exclude_end_hour: cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
      pending_sync: 1,
    });

    try {
      await savePinConfig({
        device_mac: resolvedDeviceMac,
        pin,
        name: cfg.name || "",
        auto_on: !!cfg.autoOn,
        auto_off: !!cfg.autoOff,
        off_delay: cfg.offDelay || 600,
        load_watt: cfg.loadWatt ?? DEFAULT_LOAD_WATT,
        on_exclude_start_hour: cfg.onExcludeStartHour ?? DEFAULT_EXCLUDE_START,
        on_exclude_end_hour: cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
      });
      await markPinConfigSynced(resolvedDeviceMac, pin);
      showToast("Changes saved and applied.");
    } catch {
      showToast("Saved offline. Will sync when online.");
    }
  };

  const saveAllPinConfigs = async () => {
    const targetSensor = attachedSensors[0];
    const saveTasks: Promise<any>[] = [];
    const changedPins: number[] = [];
    for (const d of devices) {
      const cfg = pinConfigs[d.id] || {
        name: d.name || "",
        autoOn: false,
        autoOff: false,
        offDelay: 600,
        loadWatt: DEFAULT_LOAD_WATT,
        onExcludeStartHour: DEFAULT_EXCLUDE_START,
        onExcludeEndHour: DEFAULT_EXCLUDE_END,
      };
      const signature = JSON.stringify(cfg);
      if (pinConfigBaseline[d.id] === signature) continue;
      changedPins.push(d.id);
      saveTasks.push(
        (async () => {
          await upsertPinConfigLocal({
            device_mac: resolvedDeviceMac,
            pin: d.id,
            name: cfg.name || "",
            auto_on: cfg.autoOn ? 1 : 0,
            auto_off: cfg.autoOff ? 1 : 0,
            off_delay: cfg.offDelay || 600,
            load_watt: cfg.loadWatt ?? DEFAULT_LOAD_WATT,
            on_exclude_start_hour:
              cfg.onExcludeStartHour ?? DEFAULT_EXCLUDE_START,
            on_exclude_end_hour: cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
            pending_sync: 1,
          });
          try {
            await savePinConfig({
              device_mac: resolvedDeviceMac,
              pin: d.id,
              name: cfg.name || "",
              auto_on: !!cfg.autoOn,
              auto_off: !!cfg.autoOff,
              off_delay: cfg.offDelay || 600,
              load_watt: cfg.loadWatt ?? DEFAULT_LOAD_WATT,
              on_exclude_start_hour:
                cfg.onExcludeStartHour ?? DEFAULT_EXCLUDE_START,
              on_exclude_end_hour: cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
            });
            await markPinConfigSynced(resolvedDeviceMac, d.id);
          } catch {
            // keep pending
          }
        })(),
      );

      if (targetSensor) {
        saveTasks.push(
          (async () => {
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
          })(),
        );
      }
    }
    if (!saveTasks.length) {
      showToast("No changes to save.");
      return;
    }
    await Promise.all(saveTasks);
    if (changedPins.length) {
      setPinConfigBaseline((prev) => {
        const next = { ...prev };
        for (const pin of changedPins) {
          const cfg = pinConfigs[pin];
          if (cfg) next[pin] = JSON.stringify(cfg);
        }
        return next;
      });
    }
    showToast("Changes saved and applied.");
    setShowPinConfigModal(false);
  };

  const handleAvailableSensors = async (list: string[]) => {
    console.log("Handle available sensors");
    if (!list.length) return;
    const unique = Array.from(new Set(list.map((s) => s.toUpperCase())));
    setAvailableSensors(unique);
    console.log(list);
    for (const mac of unique) {
      if (ignoredSensors.includes(mac)) {
        continue;
      }
      try {
        const res = await checkSensorAttachment(mac);
        console.log(res, mac);
        if (!res?.attached) {
          setPendingSensor(mac);
          setShowSensorModal(true);
          setSensorStep("prompt");
          return;
        }
      } catch {
        // fallback: show prompt if check fails (offline/timeout)
        setPendingSensor(mac);
        setShowSensorModal(true);
        setSensorStep("prompt");
        return;
      }
    }
  };

  const handleAttachedSensors = async (list: string[]) => {
    const unique = normalizeSensorMacs(list);
    if (!unique.length) {
      await persistAttachedSensors([]);
      return;
    }

    const validForThisDevice: string[] = [];
    await Promise.all(
      unique.map(async (mac) => {
        try {
          const res = await checkSensorAttachment(mac);
          const backendDevice = String(res?.device_mac || "")
            .trim()
            .toUpperCase();
          if (
            res?.attached &&
            backendDevice === resolvedDeviceMac.toUpperCase()
          ) {
            validForThisDevice.push(mac);
          }
        } catch {
          // Ignore this sensor on validation failure to avoid reviving stale entries.
        }
      }),
    );

    await persistAttachedSensors(validForThisDevice);
    // Do not auto-open popup for attached sensors.
  };

  const attachSensor = async () => {
    if (!pendingSensor) return;
    try {
      const apiDeviceMac = await resolveApiDeviceMac();
      if (!isMacAddress(apiDeviceMac)) {
        Alert.alert(
          "Failed",
          "Device MAC not resolved yet. Reopen this board and try again.",
        );
        return;
      }
      const apiRes = await attachSensorToDevice(apiDeviceMac, pendingSensor);
      const attached = String(pendingSensor).trim().toUpperCase();
      if (attached) {
        await persistAttachedSensors([...attachedSensors, attached]);
      }
      if (services.length && activeDevice) {
        const cmd = `SENSOR_ATTACH:${pendingSensor}`;
        await bleManager.sendData(activeDevice, cmd, services[0]);
      }
      setShowSensorModal(false);
      setPendingSensor(null);
      await loadPinConfigs();
      setShowPinConfigModal(true);
    } catch (e: any) {
      Alert.alert("Failed", e?.response?.data?.message || "Attach failed");
      setShowSensorModal(false);
    } finally {
    }
  };

  const ignoreSensor = async () => {
    if (!pendingSensor) return;
    await addIgnoredSensor(resolvedDeviceMac, pendingSensor);
    setIgnoredSensors((prev) => Array.from(new Set([...prev, pendingSensor])));
    setShowSensorModal(false);
    setPendingSensor(null);
  };

  const resetIgnoredSensors = async () => {
    await clearIgnoredSensors(resolvedDeviceMac);
    setIgnoredSensors([]);
  };

  // pin configuration handled in separate full-screen modal

  const detachSensor = async (macOverride?: string) => {
    const targetMac = macOverride || pendingSensor;
    if (!targetMac) return;
    const normalizedTarget = String(targetMac).trim().toUpperCase();
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
              const apiDeviceMac = await resolveApiDeviceMac();
              if (!isMacAddress(apiDeviceMac)) {
                Alert.alert(
                  "Failed",
                  "Device MAC not resolved yet. Reopen this board and try again.",
                );
                return;
              }
              await detachSensorFromDevice(apiDeviceMac, normalizedTarget);
              if (services.length && activeDevice) {
                const cmd = `SENSOR_DETACH:${normalizedTarget}`;
                await bleManager.sendData(activeDevice, cmd, services[0]);
              }
              await persistAttachedSensors(
                attachedSensors.filter((s) => s !== normalizedTarget),
              );
              setShowSensorModal(false);
              setPendingSensor(null);
            } catch (e: any) {
              const message = String(
                e?.response?.data?.message || e?.message || "",
              ).toLowerCase();
              if (message.includes("sensor not attached to this device")) {
                await persistAttachedSensors(
                  attachedSensors.filter((s) => s !== normalizedTarget),
                );
                setShowSensorModal(false);
                setPendingSensor(null);
                showToast("Sensor removed from local list.");
                return;
              }
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
      if (connectingBleRef.current) {
        bleLog("Connection skipped: another BLE connect is in progress");
        return;
      }
      connectingBleRef.current = true;
      bleLog("Starting getBleConnection", {
        macAddress,
        routeBleId: bleId,
        routeIosBleId: iosBleId,
      });
      let transportId = (bleId || iosBleId || "").toString();
      let hasTransportCandidate = !!transportId;
      const normalizedMac = String(macAddress || "")
        .trim()
        .toUpperCase();

      const validateTransportForCanonical = async (candidateId: string) => {
        const candidate = String(candidateId || "").trim();
        if (!candidate) return false;
        try {
          const mappedCanonical = await AsyncStorage.getItem(
            `ble:canonical:${candidate}`,
          );
          return (
            String(mappedCanonical || "")
              .trim()
              .toUpperCase() === normalizedMac
          );
        } catch {
          return false;
        }
      };

      if (!transportId) {
        try {
          const direct = await AsyncStorage.getItem(
            `ble:byCanonical:${normalizedMac}`,
          );
          if (direct && (await validateTransportForCanonical(direct))) {
            transportId = direct;
            hasTransportCandidate = true;
          } else if (direct) {
            bleLog("Ignoring stale direct canonical->transport mapping", {
              canonical: normalizedMac,
              mappedTransport: direct,
            });
            await AsyncStorage.removeItem(`ble:byCanonical:${normalizedMac}`);
          }

          if (!transportId) {
            const keys = await AsyncStorage.getAllKeys();
            const canonicalKeys = keys.filter((k) =>
              k.startsWith("ble:canonical:"),
            );
            for (const k of canonicalKeys) {
              const val = await AsyncStorage.getItem(k);
              if (
                String(val || "")
                  .trim()
                  .toUpperCase() !== normalizedMac
              ) {
                continue;
              }
              const candidate = k.replace("ble:canonical:", "");
              if (
                candidate &&
                (await validateTransportForCanonical(candidate))
              ) {
                transportId = candidate;
                hasTransportCandidate = true;
                break;
              }
            }
          }
        } catch {}
      }
      if (!transportId) {
        transportId = (macAddress || "").toString();
        hasTransportCandidate = false;
      }

      const normalizedTargetId = String(transportId || "")
        .trim()
        .toUpperCase();
      bleLog("Resolved target transport id", { targetId: transportId });
      await bleManager.stopScan();
      const already = await bleManager.getAlreadyConnected();
      bleLog("Already connected devices", {
        count: already.length,
        ids: already.map((d) => d.id),
      });

      const rawCandidates = [
        String(bleId || "").trim(),
        String(iosBleId || "").trim(),
        String(transportId || "").trim(),
        // only try canonical MAC directly when no transport mapping is available
        ...(hasTransportCandidate ? [] : [String(macAddress || "").trim()]),
      ].filter(Boolean);
      const seenNormalized = new Set<string>();
      const candidateIds: string[] = [];
      for (const candidate of rawCandidates) {
        const key = candidate.trim().toUpperCase();
        if (!key || seenNormalized.has(key)) continue;
        seenNormalized.add(key);
        candidateIds.push(candidate);
      }

      let connected: BleDevice | null =
        already.find((d) =>
          candidateIds.some(
            (candidate) =>
              String(d.id || "").toLowerCase() === candidate.toLowerCase(),
          ),
        ) || null;
      if (
        activeDevice &&
        String(activeDevice.id || "")
          .trim()
          .toUpperCase() === normalizedTargetId &&
        services.length > 0
      ) {
        bleLog("Skipping connect: already active with services", {
          activeDeviceId: activeDevice.id,
          servicesCount: services.length,
        });
        connectingBleRef.current = false;
        return;
      }
      if (!connected) {
        for (const candidate of candidateIds) {
          bleLog("Connecting via connectSafely (direct)", { candidate });
          connected = await bleManager.connectSafely(candidate, {
            retries: 2,
            connectTimeoutMs: 6000,
            autoConnect: false,
            skipScan: true,
            scanTimeoutMs: 2500,
          });
          if (connected) break;
        }
      }

      if (!connected) {
        bleLog(
          "Trying discovery fallback to resolve live transport id by DIS MAC",
          {
            canonicalMac: normalizedMac,
          },
        );
        let discoveredTransportId: string | null = null;
        try {
          const { stop, done } = bleManager.startScan_new(
            (dev) => {
              (async () => {
                try {
                  const canonical = await getCanonicalId(dev, {
                    disconnectAfter: false,
                  });
                  if (
                    String(canonical || "")
                      .trim()
                      .toUpperCase() === normalizedMac
                  ) {
                    discoveredTransportId = dev.id;
                    bleLog("Discovery fallback matched canonical MAC", {
                      canonical: normalizedMac,
                      transportId: dev.id,
                    });
                    stop();
                  }
                } catch {}
              })();
            },
            { stopAfterMs: 5000 },
          );
          await done;
        } catch (e) {
          bleLog("Discovery fallback scan failed", e);
        }

        if (discoveredTransportId) {
          try {
            await AsyncStorage.setItem(
              `ble:byCanonical:${normalizedMac}`,
              discoveredTransportId,
            );
          } catch {}
          try {
            await bleManager.stopScan();
          } catch {}
          await new Promise((r) => setTimeout(r, 180));
          bleLog("Connecting using discovery-resolved transport", {
            discoveredTransportId,
          });
          connected = await bleManager.connectSafely(discoveredTransportId, {
            retries: 2,
            connectTimeoutMs: 7000,
            autoConnect: false,
            skipScan: true,
            scanTimeoutMs: 8000,
          });
        }
      }

      if (!connected) {
        for (const candidate of candidateIds) {
          bleLog("Retrying connect via scan-assisted connectSafely", {
            candidate,
          });
          connected = await bleManager.connectSafely(candidate, {
            retries: 1,
            connectTimeoutMs: 5000,
            autoConnect: false,
            skipScan: false,
            scanTimeoutMs: 4500,
          });
          if (connected) break;
        }
      }

      if (connected) {
        bleLog("Connected to BLE device", { connectedId: connected.id });
        // Show BLE online as soon as link is up; service resolution follows immediately.
        setIsOnline(true);
        try {
          await connected.discoverAllServicesAndCharacteristics();
        } catch (e) {
          bleLog("Service discovery failed on first attempt", e);
        }
        setActiveDevice(connected);
        let serviceIds = await bleManager.getCustomServiceId(connected);
        if (!serviceIds.length) {
          bleLog("No custom services found; retrying discovery once");
          try {
            await connected.discoverAllServicesAndCharacteristics();
            serviceIds = await bleManager.getCustomServiceId(connected);
          } catch (e) {
            bleLog("Service discovery retry failed", e);
          }
        }
        bleLog("Resolved custom services", {
          connectedId: connected.id,
          serviceIds,
        });
        setServices(serviceIds);
        setIsOnline(true);
        reconnectAttemptsRef.current = 0;
      } else {
        bleLog("Failed to connect: connected device is null");
        scheduleReconnect("connected_null");
      }
    } catch (err) {
      bleLog("getBleConnection failed", err);
      scheduleReconnect("connect_error");
    } finally {
      connectingBleRef.current = false;
    }
  };

  const resolveExpectedTransportId = React.useCallback(async () => {
    const direct = String(bleId || iosBleId || "").trim();
    if (direct) return direct;
    try {
      const cached = await AsyncStorage.getItem(
        `ble:byCanonical:${String(resolvedDeviceMac || "").toUpperCase()}`,
      );
      const id = String(cached || "").trim();
      return id || null;
    } catch {
      return null;
    }
  }, [bleId, iosBleId, resolvedDeviceMac]);

  const checkDiscoveryStatus = React.useCallback(async () => {
    if (activeDevice && services.length > 0) {
      setDiscoveryState("off");
      return;
    }
    const expectedTransport = await resolveExpectedTransportId();
    if (!expectedTransport) {
      setDiscoveryState("unknown");
      return;
    }
    setDiscoveryState("checking");
    let seen = false;
    try {
      const expectedLower = expectedTransport.toLowerCase();
      const { stop, done } = bleManager.startScan_new(
        (dev) => {
          if (String(dev.id || "").toLowerCase() === expectedLower) {
            seen = true;
            stop();
          }
        },
        { stopAfterMs: 2500 },
      );
      await done;
      setDiscoveryState(seen ? "on" : "off");
    } catch {
      setDiscoveryState("unknown");
    }
  }, [activeDevice, services.length, resolveExpectedTransportId, bleManager]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "background" && isFocused) {
        bleLog("App moved to background on Switchboard; disconnecting BLE");
        disconnectBleConnection();
        return;
      }

      const resumed =
        (prevState === "background" || prevState === "inactive") &&
        nextState === "active";
      if (resumed && isFocused) {
        bleLog("App resumed on Switchboard; reconnecting BLE");
        getBleConnection(resolvedDeviceMac);
      }
    });

    return () => sub.remove();
  }, [disconnectBleConnection, isFocused, resolvedDeviceMac]);

  useEffect(() => {
    if (activeDevice && services.length > 0) {
      setDiscoveryState("off");
    }
  }, [activeDevice, services.length]);

  const sendDataToESP = async (
    pin: number,
    command: string,
  ): Promise<boolean> => {
    if (!services.length || !activeDevice) {
      const payload: WifiPayload = {
        mac_address: resolvedDeviceMac,
        data: {
          cmd: command,
          pin: pin,
        },
      };
      const status = await sendCommandOverWifi(payload);
      return status;
    }

    try {
      const text = `PIN:${pin};STATUS:${command}`;
      await bleManager.sendData(activeDevice, text, services[0]);
      return true;
    } catch (e) {
      return false;
    }
  };

  const triggerTapHaptic = React.useCallback(() => {
    try {
      if (Platform.OS === "android") {
        // Slightly stronger single pulse for Android OEMs (e.g., Vivo).
        Vibration.cancel();
        Vibration.vibrate([0, 22], false);
      } else {
        Vibration.vibrate(10);
      }
    } catch {}
  }, []);

  const restartEspDevice = async () => {
    Alert.alert("Restart Device", "Restart this switchboard now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restart",
        style: "destructive",
        onPress: async () => {
          try {
            if (services.length && activeDevice) {
              await bleManager.sendData(activeDevice, "ESP_RESTART", services[0]);
            } else {
              const payload: WifiPayload = {
                mac_address: resolvedDeviceMac,
                data: { cmd: "esp_restart" },
              };
              await sendCommandOverWifi(payload);
            }
            Alert.alert("Restart Sent", "Device restart command sent.");
          } catch (e) {
            Alert.alert("Failed", "Unable to send restart command.");
          }
        },
      },
    ]);
  };

  const toggleDevice = async (deviceId: number) => {
    if (pendingToggleById[deviceId]) return;
    try {
      triggerTapHaptic();
      setPendingToggleById((prev) => ({ ...prev, [deviceId]: true }));
      const dev = devices.find((d) => d.id === deviceId);
      if (!dev) return;
      const current = resolvePinStatus(dev);
      const useBle = !!activeDevice && services.length > 0;
      const status = await sendDataToESP(dev.id, dev.command);
      if (status) {
        const nextVal = !current;
        setDevices((prev) =>
          prev.map((d) => {
            if (d.id !== deviceId) return d;
            return {
              ...d,
              is_on: nextVal,
              pin_status_ble: useBle ? nextVal : d.pin_status_ble,
              pin_status_wifi: !useBle ? nextVal : d.pin_status_wifi,
            };
          }),
        );
        void syncDeviceStates({ preferWifi: !useBle });
      }
    } catch (e) {
      // no-op on failure
    } finally {
      setPendingToggleById((prev) => ({ ...prev, [deviceId]: false }));
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
        mac_address: resolvedDeviceMac,
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
    } finally {
      setShowWifiModal(false);
      Alert.alert("Success", "WiFi credentials sent to device");
    }
  };

  const sendFanSpeed = async (speed: number, device: Device) => {
    const val = Math.max(30, Math.min(100, Math.round(speed)));

    if (!services.length || !activeDevice) {
      // Wi-Fi fallback
      const payload: WifiPayload = {
        mac_address: resolvedDeviceMac,
        data: { cmd: "fan_speed", pin: device.id, power: val },
      };
      await sendCommandOverWifi(payload);
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
        const useBle = !!activeDevice && services.length > 0;
        const next = [...prev];
        next[idx] = {
          ...prev[idx],
          speed: clamped,
          is_on: clamped > 0 ? true : prev[idx].is_on,
          pin_status_ble: useBle && clamped > 0 ? true : prev[idx].pin_status_ble,
          pin_status_wifi:
            !useBle && clamped > 0 ? true : prev[idx].pin_status_wifi,
        };

        (async () => {
          try {
            await sendFanSpeed(percent, device);
            await syncDeviceStates({ preferWifi: !useBle });
          } catch {
            // revert only that device
            setDevices((curr) => {
              const j = curr.findIndex((d) => d.id === device.id);
              if (j === -1) return curr;
              const copy = [...curr];
              copy[j] = {
                ...copy[j],
                speed: old,
              };
              return copy;
            });
          }
        })();

        return next;
      });
    },
    [activeDevice, services.length, syncDeviceStates],
  );

  const resolvePinStatus = (device: Device) => {
    const hasLiveBle = !!activeDevice && services.length > 0;
    if (hasLiveBle && blePinsReceived && device.pin_status_ble !== undefined) {
      return !!device.pin_status_ble;
    }
    if (device.pin_status_wifi !== undefined) {
      return !!device.pin_status_wifi;
    }
    return !!device.is_on;
  };

  const renderDeviceCard = (device: Device) => {
    const IconComponent = ROOM_ICONS[device.device_type] || Lightbulb;
    const isActive = resolvePinStatus(device);
    const speedValue = device.speed ?? 0;
    const displayName = pinConfigs[device.id]?.name?.trim() || device.name;
    const isFan = device.device_type === "fan";
    const isTogglePending = !!pendingToggleById[device.id];

    const cardTop = (
      <>
        <View style={isActive ? styles.glassOverlay : null} />
        <View style={[styles.deviceIcon, isActive && styles.deviceIconActive]}>
          <IconComponent
            size={26}
            color={isActive ? "#fff" : "#64748b"}
            strokeWidth={1.5}
          />
        </View>
        <View style={[styles.deviceInfo, isFan && styles.deviceInfoFan]}>
          <Text style={[styles.deviceName, isActive && styles.deviceNameActive]}>
            {displayName}
          </Text>
        </View>
        <View
          style={[
            styles.deviceStatus,
            { backgroundColor: isActive ? "#10b981" : "#64748b" },
          ]}
        />
      </>
    );

    if (!isFan) {
      return (
        <TouchableOpacity
          key={device.id}
          style={[styles.deviceCard, isActive && styles.deviceCardActive]}
          onPress={() => toggleDevice(device.id)}
          activeOpacity={0.85}
          disabled={isTogglePending}
        >
          {cardTop}
          {isTogglePending && <CardLoadingOverlay />}
        </TouchableOpacity>
      );
    }

    return (
      <View
        key={device.id}
        style={[styles.deviceCard, isActive && styles.deviceCardActive]}
      >
        <TouchableOpacity
          onPress={() => toggleDevice(device.id)}
          disabled={isTogglePending}
        >
          {cardTop}
        </TouchableOpacity>

        <View style={styles.speedControllerBox}>
          <View style={styles.speedLabelRow}>
            <Text style={styles.label}>Speed</Text>
          </View>
          <View style={styles.sliderRow}>
            <View style={styles.sliderWrap}>
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
        </View>
        {isTogglePending && <CardLoadingOverlay />}

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

  const discoveryStatusLabel =
    discoveryState === "on"
      ? "Discovery On"
      : discoveryState === "off"
        ? "Discovery Off"
        : discoveryState === "checking"
          ? "Checking..."
          : "Unknown";

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
          <TouchableOpacity style={styles.iconButton} onPress={restartEspDevice}>
            <Power size={20} color="#cbd5e1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, showSettings && styles.iconButtonActive]}
            onPress={openSettings}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Settings size={20} color={showSettings ? "#5b8def" : "#cbd5e1"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.boardHeader}>
          <View style={styles.boardInfo}>
            <Text style={styles.boardName}>
              {switchboardName || "Main Panel"}
            </Text>
            <Text style={styles.boardMacText}>
              DIS MAC: {String(resolvedDeviceMac || "N/A").toUpperCase()}
            </Text>
            <View style={styles.discoveryRow}>
              <Bluetooth size={13} color="#94a3b8" />
              <Text style={styles.discoveryText}>{discoveryStatusLabel}</Text>
              <TouchableOpacity
                style={styles.discoveryCheckButton}
                onPress={checkDiscoveryStatus}
                activeOpacity={0.8}
              >
                <Text style={styles.discoveryCheckButtonText}>Check</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.boardStatus}>
              <View style={styles.wifiContainer}>
                <TouchableOpacity
                  style={styles.actionChip}
                  onPress={openWifiModal}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Wifi size={14} color="#5b8def" strokeWidth={2} />
                  <Text style={styles.actionChipText}>Wifi Config</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionChip}
                  onPress={async () => {
                    setShowPinConfigModal(true);
                    loadPinConfigs();
                  }}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <SlidersHorizontal size={14} color="#cbd5e1" />
                  <Text style={styles.actionChipText}>Pin Config</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <View style={styles.boardStatusPanel}>
            <View style={styles.boardStatusIcon}>
              <Bluetooth
                size={14}
                color={isOnline ? "#10b981" : "#b91010ff"}
                strokeWidth={2.2}
              />
            </View>
            <View style={styles.boardStatusIcon}>
              <Wifi
                size={14}
                color={isWifiOnline ? "#10b981" : "#b91010ff"}
                strokeWidth={2.2}
              />
            </View>
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
                    await refreshAttachedSensorsFromBackend();
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
            <View style={styles.pinRulesContainer}>
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
                  onExcludeStartHour: DEFAULT_EXCLUDE_START,
                  onExcludeEndHour: DEFAULT_EXCLUDE_END,
                  loadWatt: DEFAULT_LOAD_WATT,
                };
                const displayName =
                  cfg.name?.trim() || d.name?.trim() || `Pin ${d.id}`;
                const offDelayMinutes = Math.max(
                  1,
                  Math.round((cfg.offDelay || 0) / 60),
                );
                const isExpanded = expandedPinId === d.id;
                const activeTab =
                  ruleTabs[d.id] ||
                  (cfg.autoOn ? "on" : cfg.autoOff ? "off" : "on");
                const summaryItems: string[] = [];
                if (cfg.autoOn) {
                  summaryItems.push(
                    `Auto On exclude: ${formatExcludeSummary(
                      cfg.onExcludeStartHour ?? DEFAULT_EXCLUDE_START,
                      cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
                    )}`,
                  );
                }
                if (cfg.autoOff) {
                  summaryItems.push(`Auto Off: ${offDelayMinutes} min`);
                }
                const summaryText =
                  attachedSensors.length === 0
                    ? ""
                    : summaryItems.length
                      ? summaryItems.join(" • ")
                      : "No rules enabled";
                return (
                  <View key={d.id} style={styles.pinConfigCard}>
                    <TouchableOpacity
                      style={styles.pinConfigHeader}
                      onPress={() => togglePinExpanded(d.id)}
                      activeOpacity={0.8}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <View style={styles.pinConfigHeaderText}>
                        <Text style={styles.pinConfigTitle}>
                          {displayName} · Pin {d.id}
                        </Text>
                        {!isExpanded && (
                          <Text
                            style={[
                              styles.pinConfigSummary,
                              (cfg.autoOn || cfg.autoOff) &&
                                styles.pinConfigSummaryActive,
                            ]}
                          >
                            {summaryText}
                          </Text>
                        )}
                      </View>
                      <View style={styles.pinConfigHeaderRight}>
                        {isExpanded ? (
                          <ChevronUp size={18} color="#cbd5e1" />
                        ) : (
                          <ChevronDown size={18} color="#cbd5e1" />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.pinConfigBody}>
                        <TextInput
                          style={styles.pinNameInput}
                          placeholder="Switch name"
                          placeholderTextColor="#64748b"
                          value={cfg.name}
                          onChangeText={(v) =>
                            updatePinConfig(d.id, { name: v })
                          }
                        />

                        <View style={styles.wattRow}>
                          <Text style={styles.wattLabel}>Power</Text>
                          <View style={styles.wattInputWrap}>
                            <TextInput
                              style={styles.wattInput}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor="#64748b"
                              value={String(cfg.loadWatt ?? DEFAULT_LOAD_WATT)}
                              onChangeText={(v) => {
                                const digits = v.replace(/[^\d]/g, "");
                                const num = digits ? Number(digits) : 0;
                                updatePinConfig(d.id, {
                                  loadWatt: clampWatt(num),
                                });
                              }}
                            />
                            <View style={styles.wattSuffix}>
                              <Text style={styles.wattSuffixText}>W</Text>
                            </View>
                          </View>
                        </View>

                        {attachedSensors.length > 0 && (
                          <View style={styles.ruleTabs}>
                            <TouchableOpacity
                              style={[
                                styles.ruleTab,
                                activeTab === "on" && styles.ruleTabActive,
                              ]}
                              onPress={() => setRuleTab(d.id, "on")}
                            >
                              <Text
                                style={[
                                  styles.ruleTabText,
                                  activeTab === "on" &&
                                    styles.ruleTabTextActive,
                                ]}
                              >
                                Auto On
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.ruleTab,
                                activeTab === "off" && styles.ruleTabActive,
                              ]}
                              onPress={() => setRuleTab(d.id, "off")}
                            >
                              <Text
                                style={[
                                  styles.ruleTabText,
                                  activeTab === "off" &&
                                    styles.ruleTabTextActive,
                                ]}
                              >
                                Auto Off
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {attachedSensors.length > 0 && activeTab === "off" && (
                          <View>
                            <View style={styles.durationRow}>
                              {[120, 600, 1800].map((sec) => (
                                <TouchableOpacity
                                  key={sec}
                                  style={[
                                    styles.durationChip,
                                    cfg.offDelay === sec &&
                                      styles.durationChipActive,
                                    !cfg.autoOff && styles.durationChipDisabled,
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
                                      !cfg.autoOff &&
                                        styles.durationChipTextDisabled,
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
                            <Text style={styles.ruleNote}>
                              {displayName} will turn off automatically after no
                              activity for {offDelayMinutes} minutes.
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.ruleEnableBtn,
                                cfg.autoOff && styles.ruleEnableBtnActive,
                              ]}
                              onPress={() =>
                                updatePinConfig(d.id, { autoOff: !cfg.autoOff })
                              }
                            >
                              <Text
                                style={[
                                  styles.ruleEnableText,
                                  cfg.autoOff && styles.ruleEnableTextActive,
                                ]}
                              >
                                {cfg.autoOff ? "Enabled" : "Enable"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {attachedSensors.length > 0 && activeTab === "on" && (
                          <View style={styles.excludeCard}>
                            <Text style={styles.excludeLabel}>
                              Exclude Auto On Between
                            </Text>
                            <Text style={styles.ruleNote}>
                              Exclude hours mean this switch ignores motion
                              during that time. Useful if you don't want lights
                              turning on at night and disturbing sleep.
                            </Text>
                            <View style={styles.excludeRow}>
                              <View style={styles.excludeBlock}>
                                <Text style={styles.excludeBlockLabel}>
                                  Start
                                </Text>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={styles.hourScroll}
                                  contentOffset={{
                                    x: getHourScrollOffset(
                                      cfg.onExcludeStartHour ??
                                        DEFAULT_EXCLUDE_START,
                                    ),
                                    y: 0,
                                  }}
                                  ref={(node) => {
                                    hourScrollRefs.current[`${d.id}-start`] =
                                      node;
                                  }}
                                >
                                  {Array.from({ length: 24 }).map((_, hour) => (
                                    <TouchableOpacity
                                      key={`start-${hour}`}
                                      style={[
                                        styles.hourChip,
                                        cfg.onExcludeStartHour === hour &&
                                          styles.hourChipActive,
                                        !cfg.autoOn &&
                                          cfg.onExcludeStartHour === hour &&
                                          styles.hourChipDisabled,
                                      ]}
                                      onPress={() =>
                                        updatePinConfig(d.id, {
                                          onExcludeStartHour: hour,
                                        })
                                      }
                                      onPressIn={() =>
                                        hourScrollRefs.current[
                                          `${d.id}-start`
                                        ]?.scrollTo({
                                          x: getHourScrollOffset(hour),
                                          animated: true,
                                        })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.hourChipText,
                                          cfg.onExcludeStartHour === hour &&
                                            styles.hourChipTextActive,
                                          !cfg.autoOn &&
                                            cfg.onExcludeStartHour === hour &&
                                            styles.hourChipTextDisabled,
                                        ]}
                                      >
                                        {formatHourLabel(hour)}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>

                              <View style={styles.excludeBlock}>
                                <Text style={styles.excludeBlockLabel}>
                                  End
                                </Text>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={styles.hourScroll}
                                  contentOffset={{
                                    x: getHourScrollOffset(
                                      cfg.onExcludeEndHour ??
                                        DEFAULT_EXCLUDE_END,
                                    ),
                                    y: 0,
                                  }}
                                  ref={(node) => {
                                    hourScrollRefs.current[`${d.id}-end`] =
                                      node;
                                  }}
                                >
                                  {Array.from({ length: 24 }).map((_, hour) => (
                                    <TouchableOpacity
                                      key={`end-${hour}`}
                                      style={[
                                        styles.hourChip,
                                        cfg.onExcludeEndHour === hour &&
                                          styles.hourChipActive,
                                        !cfg.autoOn &&
                                          cfg.onExcludeEndHour === hour &&
                                          styles.hourChipDisabled,
                                      ]}
                                      onPress={() =>
                                        updatePinConfig(d.id, {
                                          onExcludeEndHour: hour,
                                        })
                                      }
                                      onPressIn={() =>
                                        hourScrollRefs.current[
                                          `${d.id}-end`
                                        ]?.scrollTo({
                                          x: getHourScrollOffset(hour),
                                          animated: true,
                                        })
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.hourChipText,
                                          cfg.onExcludeEndHour === hour &&
                                            styles.hourChipTextActive,
                                          !cfg.autoOn &&
                                            cfg.onExcludeEndHour === hour &&
                                            styles.hourChipTextDisabled,
                                        ]}
                                      >
                                        {formatHourLabel(hour)}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.ruleEnableBtn,
                                cfg.autoOn && styles.ruleEnableBtnActive,
                              ]}
                              onPress={() =>
                                updatePinConfig(d.id, {
                                  autoOn: !cfg.autoOn,
                                  onExcludeStartHour:
                                    cfg.onExcludeStartHour ??
                                    DEFAULT_EXCLUDE_START,
                                  onExcludeEndHour:
                                    cfg.onExcludeEndHour ?? DEFAULT_EXCLUDE_END,
                                })
                              }
                            >
                              <Text
                                style={[
                                  styles.ruleEnableText,
                                  cfg.autoOn && styles.ruleEnableTextActive,
                                ]}
                              >
                                {cfg.autoOn ? "Enabled" : "Enable"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
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
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
  speedLabelRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  sliderRow: {
    marginTop: 2,
    flexDirection: "column",
    alignItems: "stretch",
  },
  sliderWrap: {
    width: "100%",
  },
  label: { color: "#cbd5e1", fontSize: 13 },
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
  contentContainer: {
    paddingBottom: 50,
  },
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#1e293b",
    marginHorizontal: 24,
    marginTop: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  boardInfo: {
    flex: 1,
  },
  discoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 6,
  },
  discoveryText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  discoveryCheckButton: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
  },
  discoveryCheckButtonText: {
    fontSize: 11,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  boardName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  boardMacText: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 10,
    fontWeight: "500",
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
    gap: 8,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(91, 141, 239, 0.35)",
    backgroundColor: "rgba(91, 141, 239, 0.12)",
  },
  actionChipText: {
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: "700",
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
  boardStatusPanel: {
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginLeft: 12,
  },
  boardStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.3)",
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
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  deviceInfo: {
    marginBottom: 10,
  },
  deviceInfoFan: {
    marginBottom: 0,
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
  deviceLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    backgroundColor: "#5b8def",
    overflow: "hidden",
    zIndex: 20,
  },
  deviceLoadingSweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "44%",
    backgroundColor: "rgba(255,255,255,0.32)",
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
  pinRulesContainer: {
    backgroundColor: "transparent",
    borderRadius: 0,
    padding: 0,
    marginBottom: 16,
    borderWidth: 0,
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
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  pinConfigHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pinConfigHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  pinConfigSummary: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  pinConfigSummaryActive: {
    color: "#86efac",
  },
  pinConfigBody: {
    paddingTop: 2,
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
  durationChipDisabled: {
    borderColor: "#475569",
    backgroundColor: "rgba(148, 163, 184, 0.08)",
  },
  durationChipTextDisabled: {
    color: "#94a3b8",
  },
  wattRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  wattLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  wattInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  wattInput: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: "#fff",
    minWidth: 60,
    textAlign: "right",
  },
  wattSuffix: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#111827",
    borderLeftWidth: 1,
    borderLeftColor: "#334155",
  },
  wattSuffixText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12,
  },
  ruleTabs: {
    flexDirection: "row",
    gap: 10,
  },
  ruleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
    alignItems: "center",
  },
  ruleTabActive: {
    borderColor: "#2563eb",
    backgroundColor: "rgba(37, 99, 235, 0.18)",
  },
  ruleTabText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "700",
  },
  ruleTabTextActive: {
    color: "#bfdbfe",
  },
  ruleEnableBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
    alignItems: "center",
  },
  ruleEnableBtnActive: {
    borderColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.18)",
  },
  ruleEnableText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 13,
  },
  ruleEnableTextActive: {
    color: "#86efac",
  },
  ruleNote: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  excludeCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  excludeLabel: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  excludeRow: {
    gap: 12,
  },
  excludeBlock: {
    gap: 6,
  },
  excludeBlockLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
  },
  hourScroll: {
    paddingRight: 4,
    gap: 8,
  },
  hourChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
    minWidth: HOUR_CHIP_MIN_WIDTH,
    alignItems: "center",
  },
  hourChipActive: {
    borderColor: "#f59e0b",
    backgroundColor: "rgba(245, 158, 11, 0.18)",
  },
  hourChipDisabled: {
    borderColor: "#475569",
    backgroundColor: "rgba(148, 163, 184, 0.08)",
  },
  hourChipText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  hourChipTextActive: {
    color: "#fde68a",
  },
  hourChipTextDisabled: {
    color: "#94a3b8",
  },
});
