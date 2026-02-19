import {
  fetchDevicesByMac,
  fetchDevicesByRoomForUser,
  getDeviceStatusOverWifi,
  removeSwitchboard,
} from "@/api/devics";
import { removeRoom } from "@/api/room";
import { useDebouncedCallback } from "@/callbacks/useDeboundcedCallback";
import { getRoomsLocal } from "@/db/rooms.local";
import { getSwitchboardsLocal } from "@/db/switchboards.local";
import {
  addIgnoredSwitchboard,
  getIgnoredSwitchboards,
  getNearbyDevicesCache,
  getRoomsByRoomCache,
  setNearbyDevicesCache,
  setPendingSwitchboardDeviceId,
  setRoomsByRoomCache,
} from "@/utils/storage";
import { syncAppData } from "@/db_sync/app_sync";
import DeleteWarningModal from "@/components/DeleteWarningModal";
import { getCanonicalId } from "@/services/bleCanonicalId";
import BLEManagerService from "@/services/bleManager";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { MapPin, Plus, User, Wifi } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Platform,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Device as BleDevice } from "react-native-ble-plx";

interface Room {
  id: string;
  name: string;
  icon: string;
  switchboardCount: number;
}

interface Switchboard {
  id: string;
  name: string;
  room_name: string;
  color: string;
  is_online: boolean;
  icon: string;
  sensors?: string[];
}

type DeleteDetails = {
  label: string;
  value: string;
  highlight?: boolean;
};

type DeleteContext =
  | {
      type: "room";
      room: Room;
    }
  | {
      type: "switchboard";
      board: Switchboard;
    };

const normalizeSensors = (value: unknown): string[] => {
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

const SWITCHBOARD_COLORS = [
  "#5b8def",
  "#7c6fd8",
  "#4ade80",
  "#5eead4",
  "#fbbf24",
  "#fb923c",
];

type Row = {
  id: string; // transport id (device.id)
  name: string | null;
  rssi: number | null;
  device: BleDevice;
  canonicalId?: string;
  iosBleId?: string;
};

const isMacAddress = (value: string) =>
  /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(String(value || "").trim());

const formatRssi = (rssi: number | null) =>
  typeof rssi === "number" ? `${rssi} dBm` : "N/A";

const estimateDistanceMeters = (rssi: number | null): string => {
  if (typeof rssi !== "number") return "N/A";
  const txPowerAt1m = -59;
  const pathLossExponent = 2.2;
  const distance = Math.pow(10, (txPowerAt1m - rssi) / (10 * pathLossExponent));
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0.05, Math.min(distance, 99.9))
    : 99.9;
  return `${safeDistance.toFixed(safeDistance < 10 ? 2 : 1)} m`;
};

const estimateDistanceValue = (rssi: number | null): number | null => {
  if (typeof rssi !== "number") return null;
  const txPowerAt1m = -59;
  const pathLossExponent = 2.2;
  const distance = Math.pow(10, (txPowerAt1m - rssi) / (10 * pathLossExponent));
  if (!Number.isFinite(distance)) return null;
  return Math.max(0.05, Math.min(distance, 99.9));
};

const getSignalMeta = (rssi: number | null) => {
  if (typeof rssi !== "number") {
    return {
      label: "Unknown",
      color: "#94a3b8",
    };
  }
  if (rssi >= -60) {
    return {
      label: "Good",
      color: "#34d399",
    };
  }
  if (rssi >= -75) {
    return {
      label: "Medium",
      color: "#fbbf24",
    };
  }
  return {
    label: "Weak",
    color: "#f87171",
  };
};

const getDistanceMeta = (rssi: number | null) => {
  const distance = estimateDistanceValue(rssi);
  if (distance == null) {
    return {
      label: "Unknown",
      color: "#94a3b8",
    };
  }
  if (distance <= 2) {
    return {
      label: "Near",
      color: "#34d399",
    };
  }
  if (distance <= 6) {
    return {
      label: "Medium",
      color: "#fbbf24",
    };
  }
  return {
    label: "Far",
    color: "#f87171",
  };
};

export default function HomeScreen({ navigation }: any) {
  const bleManagerRef = React.useRef<BLEManagerService | null>(null);
  if (!bleManagerRef.current) bleManagerRef.current = new BLEManagerService();
  const bleManager = bleManagerRef.current;
  const isFocused = useIsFocused();
  const [scanning, setScanning] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsWithBoards, setRoomsWithBoards] = useState<
    { room: Room; devices: Switchboard[] }[]
  >([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [switchboards, setSwitchboards] = useState<Switchboard[]>([]);
  const [localBoardIds, setLocalBoardIds] = useState<Set<string>>(new Set());
  const [localBoardIdsLoaded, setLocalBoardIdsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [ignoredSwitchboards, setIgnoredSwitchboards] = useState<string[]>([]);
  const [newBoardModalVisible, setNewBoardModalVisible] = useState(false);
  const [suppressNewBoardPopupForSession, setSuppressNewBoardPopupForSession] =
    useState(false);
  const [candidateDevices, setCandidateDevices] = useState<Row[]>([]);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteModalTitle, setDeleteModalTitle] = useState("");
  const [deleteModalMessage, setDeleteModalMessage] = useState("");
  const [deleteModalWarning, setDeleteModalWarning] = useState("");
  const [deleteModalDetails, setDeleteModalDetails] = useState<DeleteDetails[]>(
    [],
  );
  const [deleteModalLoading, setDeleteModalLoading] = useState(false);
  const [deleteModalProcessing, setDeleteModalProcessing] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState("");
  const [deleteContext, setDeleteContext] = useState<DeleteContext | null>(
    null,
  );
  const scanningRef = React.useRef(false);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const boardAnim = React.useRef(new Animated.Value(0)).current;
  const newBoardSheetY = React.useRef(new Animated.Value(0)).current;
  const dismissedBoardRef = React.useRef<{ id: string; at: number } | null>(
    null,
  );
  const bleNearbyIds = React.useMemo(
    () =>
      new Set(
        devices
          .map((d) =>
            String(d.canonicalId || d.id || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    [devices],
  );

  const isBoardOnline = React.useCallback(
    (boardId: string, wifiOnline?: boolean) => {
      const normalized = String(boardId || "")
        .trim()
        .toUpperCase();
      return !!wifiOnline || bleNearbyIds.has(normalized);
    },
    [bleNearbyIds],
  );

  const fetchAlreadyConnected = useCallback(async () => {
    try {
      const already = await bleManager.connectedDevices();
      return already;
    } catch (e: any) {
      console.warn("Error fetching connected devices", e);
      return [];
    }
  }, []);

  const refreshLocalBoardIds = useCallback(async () => {
    setLocalBoardIdsLoaded(false);
    try {
      const localBoards = await getSwitchboardsLocal();
      const ids = new Set(
        localBoards
          .map((b) =>
            String(b.id || "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      );
      setLocalBoardIds(ids);
    } catch (e) {
      console.warn("Failed to load local switchboards for popup filtering", e);
      setLocalBoardIds(new Set());
    } finally {
      setLocalBoardIdsLoaded(true);
    }
  }, []);

  const onDeviceFound = React.useCallback(async (device: BleDevice) => {
    console.log("Discovered device:", device.id, device.name);
    // Canonical id must be a stable board MAC from DIS serial (2A25).
    let canonicalId: string | null = null;
    try {
      canonicalId = await getCanonicalId(device);
      console.log(`Canonical ID for device ${device.id} is ${canonicalId}`);
    } catch (e) {
      console.warn(
        "canonicalId lookup failed; trying transport-id fallback",
        e,
      );
    }

    let normalizedCanonical = String(canonicalId || "")
      .trim()
      .toUpperCase();
    if (!isMacAddress(normalizedCanonical)) {
      const transportAsMac = String(device.id || "")
        .trim()
        .toUpperCase();
      if (isMacAddress(transportAsMac)) {
        console.warn(
          `Using transport MAC fallback for ${device.id}: ${transportAsMac}`,
        );
        normalizedCanonical = transportAsMac;
      }
    }

    if (!isMacAddress(normalizedCanonical)) {
      console.warn(
        `Invalid canonical/transport MAC for ${device.id} (canonical="${canonicalId}"); skipping`,
      );
      return;
    }

    setDevices((prev) => {
      const idx = prev.findIndex(
        (r) =>
          String(r.canonicalId || "").toUpperCase() === normalizedCanonical,
      );
      if (idx >= 0) {
        const cur = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...cur,
          device,
          id: normalizedCanonical,
          name: device.name ?? cur.name,
          rssi: device.rssi ?? cur.rssi,
          iosBleId: Platform.OS === "ios" ? device.id : cur.iosBleId,
        };
        return next;
      }
      return [
        ...prev,
        {
          id: normalizedCanonical,
          name: device.name ?? null,
          rssi: device.rssi ?? null,
          device,
          canonicalId: normalizedCanonical,
        },
      ];
    });
  }, []);

  const getActiveSwitchCount = React.useCallback(async (deviceId: string) => {
    try {
      const wifiStatus = await getDeviceStatusOverWifi(deviceId);
      const pins = wifiStatus?.status?.pins;
      if (!pins || typeof pins !== "object") return 0;
      return Object.values(pins).reduce((acc, value) => {
        if (value === 1 || value === "1" || value === true) return acc + 1;
        return acc;
      }, 0);
    } catch {
      return 0;
    }
  }, []);

  const runScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    try {
      // Reset to current scan window so BLE availability is always fresh.
      setDevices([]);
      const { done } = bleManager.startScan_new(onDeviceFound, {
        stopAfterMs: 30000,
      });
      await done;
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }, [bleManager, onDeviceFound]);

  useFocusEffect(
    useCallback(() => {
      console.log("FocusEffect runScan called");

      runScan();

      return () => {
        console.log("FocusEffect cleanup – stopping scan");
        bleManager.stopScan();
      };
    }, [runScan]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      const resumed =
        (prevState === "background" || prevState === "inactive") &&
        nextState === "active";
      if (!resumed) return;
      if (!isFocused) return;

      console.log("App resumed on HomeScreen; refreshing BLE + rooms");
      runScan();
      loadRooms();
    });
    return () => sub.remove();
  }, [isFocused, runScan, loadRooms]);

  useFocusEffect(
    useCallback(() => {
      refreshLocalBoardIds();
      return () => {};
    }, [refreshLocalBoardIds]),
  );

  // useEffect(() => {
  //   console.log("Effect runScan called");
  //   let cancelled = false;
  //   (async () => {
  //     await runScan();
  //   })();
  //   return () => {
  //     console.log("Uneffect runScan cleanup called");
  //     cancelled = true;
  //     bleManager.stopScan();
  //   };
  // }, [runScan]);

  const loadRooms = useCallback(async () => {
    setLoading(true);

    try {
      // 1️⃣ Always load from LOCAL first
      const localRooms = await getRoomsLocal();
      if (localRooms.length > 0) setRooms(localRooms);

      try {
        const byRoom = await fetchDevicesByRoomForUser();
        if (Array.isArray(byRoom)) {
          await setRoomsByRoomCache(byRoom);
          const mapped = byRoom.map((r) => ({
            room: {
              id: r.room?.id,
              name: r.room?.name,
              icon: r.room?.icon,
              switchboardCount: r.devices?.length || 0,
            },
            devices: (r.devices || []).map((d) => ({
              id: d.device_id,
              name: d.title,
              room_name: r.room?.name || d.room_name,
              color:
                SWITCHBOARD_COLORS[
                  Math.floor(Math.random() * SWITCHBOARD_COLORS.length)
                ],
              is_online: !!d.online,
              icon: r.room?.icon || d.room_icon,
              sensors: Array.isArray(d.sensors) ? d.sensors : [],
            })),
          }));
          setRoomsWithBoards(mapped);
          setRooms(mapped.map((m) => m.room));
        }
      } catch {
        const cached = await getRoomsByRoomCache();
        if (cached && Array.isArray(cached)) {
          const mapped = cached.map((r) => ({
            room: {
              id: r.room?.id,
              name: r.room?.name,
              icon: r.room?.icon,
              switchboardCount: r.devices?.length || 0,
            },
            devices: (r.devices || []).map((d) => ({
              id: d.device_id,
              name: d.title,
              room_name: r.room?.name || d.room_name,
              color:
                SWITCHBOARD_COLORS[
                  Math.floor(Math.random() * SWITCHBOARD_COLORS.length)
                ],
              is_online: !!d.online,
              icon: r.room?.icon || d.room_icon,
              sensors: Array.isArray(d.sensors) ? d.sensors : [],
            })),
          }));
          setRoomsWithBoards(mapped);
          setRooms(mapped.map((m) => m.room));
        }
      }
    } finally {
      setLoading(false);
      setBoardsLoaded(true);
    }
  }, []);

  const fetchDevicesDebounced = useDebouncedCallback(
    async (ids: string[]) => {
      try {
        console.log("fetchDevicesByMac called with IDs:", ids);
        const [foundDevices, byRoom] = await Promise.all([
          fetchDevicesByMac(ids),
          fetchDevicesByRoomForUser().catch(() => []),
        ]);
        console.log(
          "fetchDevicesByMac response:",
          JSON.stringify(foundDevices),
        );

        if (!foundDevices || !Array.isArray(foundDevices)) {
          console.log("fetchDevicesByMac returned empty/invalid, using cache");
          const cached = await getNearbyDevicesCache();
          if (cached && Array.isArray(cached)) {
            setSwitchboards(cached);
          }
          setBoardsLoaded(true);
          return;
        }

        const sensorsByDeviceId = new Map<string, string[]>();
        if (Array.isArray(byRoom)) {
          byRoom.forEach((r: any) => {
            (r?.devices || []).forEach((d: any) => {
              const key = String(d?.device_id || "").toUpperCase();
              if (!key) return;
              const sensors = normalizeSensors(d?.sensors || d?.sensor_ids);
              if (sensors.length) sensorsByDeviceId.set(key, sensors);
            });
          });
        }

        const nearByDevices: Switchboard[] = [];
        foundDevices.forEach((device) => {
          const responseSensors = normalizeSensors(
            (device as any).sensors || (device as any).sensor_ids,
          );
          const sensors =
            responseSensors.length > 0
              ? responseSensors
              : sensorsByDeviceId.get(String(device.device_id).toUpperCase()) ||
                [];
          const obj: Switchboard = {
            id: device.device_id,
            name: device.title,
            room_name: device.room_name,
            color:
              SWITCHBOARD_COLORS[
                Math.floor(Math.random() * SWITCHBOARD_COLORS.length)
              ],
            is_online: !!(device as any).online,
            icon: device.room_icon,
            sensors,
          };
          nearByDevices.push(obj);
        });

        console.log(
          "Setting switchboards (nearby):",
          nearByDevices.length,
          nearByDevices.map((d) => d.id),
        );
        setSwitchboards(nearByDevices);
        setBoardsLoaded(true);
        await setNearbyDevicesCache(nearByDevices);
      } catch {
        const cached = await getNearbyDevicesCache();
        if (cached && Array.isArray(cached)) {
          setSwitchboards(cached);
        }
        setBoardsLoaded(true);
      }
    },
    500,
    { leading: false, trailing: true },
    [fetchDevicesByMac],
  );

  useEffect(() => {
    syncAppData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRooms();
      return () => {};
    }, [loadRooms]),
  );

  useEffect(() => {
    getIgnoredSwitchboards().then(setIgnoredSwitchboards);
  }, []);

  useEffect(() => {
    if (!devices.length) return;
    const deviceIds = devices.map((d) => d.id);
    fetchDevicesDebounced(deviceIds);

    return () => fetchDevicesDebounced.cancel();
  }, [devices, fetchDevicesDebounced]);

  useEffect(() => {
    if (!isFocused) return;
    if (!localBoardIdsLoaded) return;
    if (!boardsLoaded) return;
    if (!devices.length) return;
    if (suppressNewBoardPopupForSession) {
      if (newBoardModalVisible) {
        closeNewBoardSheet(false, false);
      }
      return;
    }

    const existing = new Set<string>(localBoardIds);
    switchboards.forEach((s) => existing.add(String(s.id).toUpperCase()));
    const ignored = new Set(ignoredSwitchboards.map((s) => s.toUpperCase()));

    console.log(
      "All scanned devices:",
      devices.map((d) => d.canonicalId || d.id),
    );
    console.log("Existing switchboards:", [...existing]);
    console.log("Ignored switchboards:", [...ignored]);

    const freshDevices = devices.filter((d) => {
      const id = String(d.canonicalId || d.id).toUpperCase();
      if (existing.has(id)) {
        console.log("Filtered (existing):", id);
        return false;
      }
      if (ignored.has(id)) {
        console.log("Filtered (ignored):", id);
        return false;
      }
      const dismissed = dismissedBoardRef.current;
      const freshId = String(d.canonicalId || d.id);
      if (
        dismissed &&
        dismissed.id === freshId &&
        Date.now() - dismissed.at < 120000
      ) {
        console.log("Filtered (dismissed):", id);
        return false;
      }
      return true;
    });

    if (freshDevices.length > 0) {
      const sortedFreshDevices = [...freshDevices].sort((a, b) => {
        const aRssi =
          typeof a.rssi === "number" ? a.rssi : Number.NEGATIVE_INFINITY;
        const bRssi =
          typeof b.rssi === "number" ? b.rssi : Number.NEGATIVE_INFINITY;
        return bRssi - aRssi;
      });
      console.log(
        "Fresh devices found:",
        sortedFreshDevices.length,
        sortedFreshDevices.map((d) => d.canonicalId || d.id),
      );
      setCandidateDevices(sortedFreshDevices);
      if (!newBoardModalVisible) {
        setActiveCarouselIndex(0);
        setNewBoardModalVisible(true);
      }
    } else if (newBoardModalVisible) {
      // All candidates are now existing/ignored — close the modal
      console.log("No fresh devices left, closing modal");
      closeNewBoardSheet(false, false);
    }
  }, [
    isFocused,
    localBoardIdsLoaded,
    boardsLoaded,
    devices,
    localBoardIds,
    switchboards,
    ignoredSwitchboards,
    suppressNewBoardPopupForSession,
    newBoardModalVisible,
  ]);

  useEffect(() => {
    if (!newBoardModalVisible) return;
    boardAnim.setValue(0);
    newBoardSheetY.setValue(280);
    Animated.timing(newBoardSheetY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(boardAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(boardAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [newBoardModalVisible, boardAnim]);

  const closeNewBoardSheet = (
    markDismissed = false,
    keepCandidate = false,
    suppressForSession = false,
  ) => {
    if (suppressForSession) {
      setSuppressNewBoardPopupForSession(true);
    }
    Animated.timing(newBoardSheetY, {
      toValue: 280,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setNewBoardModalVisible(false);
      if (markDismissed && candidateDevices.length > 0) {
        const current = candidateDevices[activeCarouselIndex];
        if (current) {
          dismissedBoardRef.current = {
            id: String(current.canonicalId || current.id),
            at: Date.now(),
          };
        }
      }
      if (!keepCandidate) {
        setCandidateDevices([]);
        setActiveCarouselIndex(0);
      }
      newBoardSheetY.setValue(280);
    });
  };

  const newBoardPan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 6,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) newBoardSheetY.setValue(g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 24) {
            closeNewBoardSheet(true, false, true);
          } else {
            Animated.spring(newBoardSheetY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [newBoardSheetY],
  );

  const handleIgnoreNewBoard = async () => {
    const current = candidateDevices[activeCarouselIndex];
    if (!current) return;
    const id = String(current.canonicalId || current.id);
    await addIgnoredSwitchboard(id);
    setIgnoredSwitchboards((prev) => Array.from(new Set([...prev, id])));
    closeNewBoardSheet(true);
  };

  const handleAddNewBoard = async () => {
    const current = candidateDevices[activeCarouselIndex];
    if (!current) return;
    setNewBoardModalVisible(false);
    newBoardSheetY.setValue(280);
    const pendingId = String(current.canonicalId || current.id);
    await setPendingSwitchboardDeviceId(pendingId);
    setCandidateDevices([]);
    setActiveCarouselIndex(0);
    navigation.navigate("ConfirmNewBoard", {
      pendingDeviceId: pendingId,
      bleTransportId: current.device.id,
    });
  };

  const closeDeleteModal = React.useCallback(
    (force = false) => {
      if (deleteModalProcessing && !force) return;
      setDeleteModalVisible(false);
      setDeleteModalLoading(false);
      setDeleteModalError("");
      setDeleteModalTitle("");
      setDeleteModalMessage("");
      setDeleteModalWarning("");
      setDeleteModalDetails([]);
      setDeleteContext(null);
    },
    [deleteModalProcessing],
  );

  const handleRemoveSwitchboard = React.useCallback(
    async (board: Switchboard) => {
      setDeleteContext({ type: "switchboard", board });
      setDeleteModalVisible(true);
      setDeleteModalLoading(true);
      setDeleteModalError("");
      setDeleteModalTitle("Remove Switchboard");
      setDeleteModalMessage(
        `Do you want to remove "${board.name}" from your app?`,
      );

      const activeSwitches = await getActiveSwitchCount(board.id);

      setDeleteModalDetails([
        { label: "Switchboard", value: board.name || "-" },
        { label: "MAC", value: board.id },
        { label: "Room", value: board.room_name || "-" },
        {
          label: "Active Switches",
          value: String(activeSwitches),
          highlight: activeSwitches > 0,
        },
      ]);
      setDeleteModalWarning(
        activeSwitches > 0
          ? "Warning: This switchboard currently has running switches."
          : "",
      );
      setDeleteModalLoading(false);
    },
    [getActiveSwitchCount],
  );

  const handleRemoveRoom = React.useCallback(
    async (room: Room, roomSwitchboards: Switchboard[]) => {
      setDeleteContext({ type: "room", room });
      setDeleteModalVisible(true);
      setDeleteModalLoading(true);
      setDeleteModalError("");
      setDeleteModalTitle("Remove Room");
      setDeleteModalMessage(
        `This will remove room "${room.name}" and all switchboards mapped to it.`,
      );

      const checks = await Promise.all(
        roomSwitchboards.map(async (board) => {
          const activeSwitches = await getActiveSwitchCount(board.id);
          return { board, activeSwitches };
        }),
      );
      const activeBoards = checks.filter((c) => c.activeSwitches > 0);
      const totalActiveSwitches = checks.reduce(
        (sum, item) => sum + item.activeSwitches,
        0,
      );

      setDeleteModalDetails([
        { label: "Room", value: room.name || "-" },
        { label: "Total Switchboards", value: String(roomSwitchboards.length) },
        {
          label: "Boards With Active Switches",
          value: String(activeBoards.length),
          highlight: activeBoards.length > 0,
        },
        {
          label: "Total Active Switches",
          value: String(totalActiveSwitches),
          highlight: totalActiveSwitches > 0,
        },
      ]);
      setDeleteModalWarning(
        totalActiveSwitches > 0
          ? "Warning: One or more switchboards in this room currently have running switches."
          : "",
      );
      setDeleteModalLoading(false);
    },
    [getActiveSwitchCount],
  );

  const confirmDelete = React.useCallback(async () => {
    if (!deleteContext) return;
    setDeleteModalProcessing(true);
    setDeleteModalError("");
    try {
      if (deleteContext.type === "switchboard") {
        await removeSwitchboard(deleteContext.board.id);
      } else {
        await removeRoom(deleteContext.room.id);
      }
      await Promise.all([loadRooms(), refreshLocalBoardIds()]);
      runScan();
      closeDeleteModal(true);
    } catch (e: any) {
      setDeleteModalError(
        e?.response?.data?.err ||
          (deleteContext.type === "switchboard"
            ? "Unable to remove switchboard"
            : "Unable to remove room"),
      );
    } finally {
      setDeleteModalProcessing(false);
    }
  }, [
    deleteContext,
    closeDeleteModal,
    loadRooms,
    refreshLocalBoardIds,
    runScan,
  ]);

  const openSwitchboardFromHome = async (payload: {
    switchboardId: string;
    switchboardName: string;
    deviceId: string;
    status: boolean;
    iosBleId?: string;
    bleId?: string;
    sensors?: string[];
  }) => {
    try {
      await bleManager.disconnectAllConnectedDevices();
    } catch {}
    navigation.navigate("Switchboard", payload);
  };

  const onlineCount = switchboards.filter((sb) =>
    isBoardOnline(sb.id, sb.is_online),
  ).length;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadRooms}
            tintColor="#fff"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>
              {new Date().getHours() < 12
                ? "Good Morning"
                : new Date().getHours() < 18
                  ? "Good Afternoon"
                  : "Good Evening"}
            </Text>
            <Text style={styles.subtitle}>Welcome back to your smart home</Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <User size={20} color="#94a3b8" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleSmall}>
              Nearby Devices · {onlineCount} online
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.edgeScroll}
          >
            <View style={[styles.switchboardRow, styles.switchboardRowPadded]}>
              {switchboards.map((switchboard) => {
                const isOnline = isBoardOnline(
                  switchboard.id,
                  switchboard.is_online,
                );
                return (
                  <TouchableOpacity
                    key={switchboard.id}
                    style={styles.switchboardCardHorizontal}
                    onLongPress={() => handleRemoveSwitchboard(switchboard)}
                    delayLongPress={500}
                    onPress={() =>
                      openSwitchboardFromHome({
                        switchboardId: switchboard.id,
                        switchboardName: switchboard.name,
                        deviceId: switchboard.id,
                        status: isOnline,
                        iosBleId: devices.find(
                          (d) => d.canonicalId === switchboard.id,
                        )?.iosBleId,
                        bleId: devices.find(
                          (d) => d.canonicalId === switchboard.id,
                        )?.device?.id,
                        sensors: switchboard.sensors || [],
                      })
                    }
                  >
                    <View
                      style={[
                        styles.switchboardIcon,
                        { backgroundColor: switchboard.color },
                      ]}
                    />
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: isOnline ? "#10b981" : "#64748b" },
                      ]}
                    />
                    <Text style={styles.switchboardName} numberOfLines={1}>
                      {switchboard.name}
                    </Text>
                    <Text style={styles.switchboardRoom}>
                      {switchboard.room_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {roomsWithBoards.map((item) => {
          const room = item.room;
          const roomSwitchboards = item.devices;
          return (
            <View key={room.id} style={styles.section}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onLongPress={() => handleRemoveRoom(room, roomSwitchboards)}
                delayLongPress={500}
                activeOpacity={1}
              >
                <Text style={styles.sectionTitleSmall}>
                  {room.name} ·{" "}
                  {room.switchboardCount || roomSwitchboards.length}
                </Text>
              </TouchableOpacity>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.edgeScroll}
              >
                <View
                  style={[styles.switchboardRow, styles.switchboardRowPadded]}
                >
                  {roomSwitchboards.map((switchboard) => {
                    const isOnline = isBoardOnline(
                      switchboard.id,
                      switchboard.is_online,
                    );

                    return (
                      <TouchableOpacity
                        key={switchboard.id}
                        style={styles.switchboardCardHorizontal}
                        onLongPress={() => handleRemoveSwitchboard(switchboard)}
                        delayLongPress={500}
                        onPress={() =>
                          openSwitchboardFromHome({
                            switchboardId: switchboard.id,
                            switchboardName: switchboard.name,
                            deviceId: switchboard.id,
                            status: isOnline,
                            iosBleId: devices.find(
                              (d) => d.canonicalId === switchboard.id,
                            )?.iosBleId,
                            bleId: devices.find(
                              (d) => d.canonicalId === switchboard.id,
                            )?.device?.id,
                            sensors: switchboard.sensors || [],
                          })
                        }
                      >
                        <View
                          style={[
                            styles.switchboardIcon,
                            { backgroundColor: switchboard.color },
                          ]}
                        />
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: isOnline ? "#10b981" : "#64748b",
                            },
                          ]}
                        />
                        <Text style={styles.switchboardName} numberOfLines={1}>
                          {switchboard.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.addSwitchboardCard}
                    onPress={() =>
                      navigation.navigate("AddSwitchboard", { roomId: room.id })
                    }
                  >
                    <Plus size={20} color="#5b8def" strokeWidth={2.5} />
                    <Text style={styles.addSwitchboardText}>Add Board</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.createRoomFooter}
          onPress={() => navigation.navigate("AddRoom")}
        >
          <Plus size={18} color="#5b8def" strokeWidth={2.5} />
          <Text style={styles.createRoomText}>Create New Room</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal
        visible={newBoardModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeNewBoardSheet}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.bottomSheet,
              { transform: [{ translateY: newBoardSheetY }] },
            ]}
          >
            <View style={styles.sheetHandle} {...newBoardPan.panHandlers}>
              <View style={styles.sheetHandleBar} />
            </View>
            <Text style={styles.sheetTitle}>
              {candidateDevices.length > 1
                ? `${candidateDevices.length} New Switchboards Found`
                : "New Switchboard Found"}
            </Text>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const pageWidth = Dimensions.get("window").width - 40;
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / pageWidth,
                );
                setActiveCarouselIndex(index);
              }}
              style={{ flexGrow: 0 }}
            >
              {candidateDevices.map((item) => {
                const signalMeta = getSignalMeta(item.rssi);
                const distanceMeta = getDistanceMeta(item.rssi);
                return (
                  <View
                    key={item.canonicalId || item.id}
                    style={styles.sheetPage}
                  >
                    <View style={styles.sheetDeviceCard}>
                      <View style={styles.sheetTopRow}>
                        <View style={styles.sheetMacBlock}>
                          <Text style={styles.sheetMac}>
                            {item.canonicalId || item.id}
                          </Text>
                          <View style={styles.sheetDistanceRow}>
                            <MapPin
                              size={14}
                              color="#94a3b8"
                              strokeWidth={2.3}
                            />
                            <Text
                              style={[
                                styles.sheetStatusText,
                                styles.sheetDistanceText,
                              ]}
                            >
                              {distanceMeta.label} ·{" "}
                              {estimateDistanceMeters(item.rssi)}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.sheetStatusPill]}>
                          <Wifi
                            size={14}
                            color={signalMeta.color}
                            strokeWidth={2.3}
                          />
                          <Text
                            style={[
                              styles.sheetStatusText,
                              { color: signalMeta.color },
                            ]}
                          >
                            {signalMeta.label} · {formatRssi(item.rssi)}
                          </Text>
                        </View>
                      </View>
                      <Animated.View
                        style={[
                          styles.boardHeroWrap,
                          {
                            transform: [
                              {
                                translateY: boardAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, -6],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <Image
                          source={require("@/assets/images/board-image.png")}
                          style={styles.boardHero}
                        />
                      </Animated.View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {candidateDevices.length > 1 && (
              <View style={styles.carouselDots}>
                {candidateDevices.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.carouselDot,
                      i === activeCarouselIndex && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetButtonGhost]}
                onPress={handleIgnoreNewBoard}
              >
                <Text style={styles.sheetButtonGhostText}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetButton, styles.sheetButtonPrimary]}
                onPress={handleAddNewBoard}
              >
                <Text style={styles.sheetButtonPrimaryText}>Add Now</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
      <DeleteWarningModal
        visible={deleteModalVisible}
        title={deleteModalTitle}
        message={deleteModalMessage}
        warningText={deleteModalWarning}
        details={deleteModalDetails}
        loading={deleteModalLoading}
        processing={deleteModalProcessing}
        errorText={deleteModalError}
        confirmLabel="Remove"
        onCancel={closeDeleteModal}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  section: {
    paddingHorizontal: 0,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 24,
  },
  sectionTitleSmall: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 1,
    marginBottom: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(91, 141, 239, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(91, 141, 239, 0.3)",
  },
  switchboardRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  switchboardRowPadded: {
    paddingLeft: 24,
    paddingRight: 12,
  },
  edgeScroll: {
    paddingHorizontal: 0,
  },
  switchboardCardHorizontal: {
    width: 120,
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    position: "relative",
  },
  addSwitchboardCard: {
    width: 120,
    backgroundColor: "rgba(91, 141, 239, 0.08)",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(91, 141, 239, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addSwitchboardText: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  switchboardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#2d3b52",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.3)",
  },
  switchboardName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  switchboardRoom: {
    fontSize: 11,
    color: "#94a3b8",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: "absolute",
    top: 10,
    right: 10,
  },
  createRoomFooter: {
    marginTop: 12,
    marginBottom: 48,
    marginHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0b1220",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  createRoomText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  bottomSheet: {
    backgroundColor: "#0f172a",
    padding: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderColor: "#1e293b",
    borderWidth: 1,
    paddingBottom: 20,
  },
  sheetHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    paddingBottom: 10,
  },
  sheetHandleBar: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.6)",
  },
  sheetTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  sheetPage: {
    width: Dimensions.get("window").width - 40,
    alignItems: "center",
  },
  sheetDeviceCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#111c31",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetMac: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 5,
  },
  sheetTopRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    alignItems: "flex-start",
  },
  sheetMacBlock: {
    flex: 1,
    minWidth: 0,
  },
  sheetDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sheetStatusPill: {
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheetStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sheetDistanceText: {
    color: "#94a3b8",
  },
  boardHeroWrap: {
    alignItems: "center",
    marginTop: 2,
  },
  boardHero: {
    width: 240,
    height: 170,
    resizeMode: "contain",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingBottom: 20,
  },
  sheetButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  sheetButtonGhost: {
    borderWidth: 1,
    borderColor: "#334155",
  },
  sheetButtonGhostText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  sheetButtonPrimary: {
    backgroundColor: "#5b8def",
  },
  sheetButtonPrimaryText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  carouselDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#334155",
  },
  carouselDotActive: {
    backgroundColor: "#5b8def",
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
