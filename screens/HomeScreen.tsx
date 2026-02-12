import { fetchDevicesByMac, fetchDevicesByRoomForUser } from "@/api/devics";
import { useDebouncedCallback } from "@/callbacks/useDeboundcedCallback";
import { getRoomsLocal } from "@/db/rooms.local";
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
import { getCanonicalId } from "@/services/bleCanonicalId";
import BLEManagerService from "@/services/bleManager";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Plus, User } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Animated,
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
}

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
  const [loading, setLoading] = useState(false);
  const [ignoredSwitchboards, setIgnoredSwitchboards] = useState<string[]>([]);
  const [newBoardModalVisible, setNewBoardModalVisible] = useState(false);
  const [candidateDevice, setCandidateDevice] = useState<Row | null>(null);
  const boardAnim = React.useRef(new Animated.Value(0)).current;
  const newBoardSheetY = React.useRef(new Animated.Value(0)).current;
  const dismissedBoardRef = React.useRef<{ id: string; at: number } | null>(
    null,
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

  const onDeviceFound = React.useCallback(async (device: BleDevice) => {
    console.log("Discovered device:", device.id, device.name);
    // Canonical id from DIS serial (WiFi MAC). Use for all platforms.
    let canonicalId = device.id;
    try {
      canonicalId = await getCanonicalId(device);
      console.log(`Canonical ID for device ${device.id} is ${canonicalId}`);
    } catch (e) {
      console.warn("canonicalId lookup failed; fallback to device.id", e);
      canonicalId = device.id;
    }

    setDevices((prev) => {
      const idx = prev.findIndex((r) => r.canonicalId === canonicalId);
      if (idx >= 0) {
        const cur = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...cur,
          device,
          id: canonicalId,
          name: device.name ?? cur.name,
          rssi: device.rssi ?? cur.rssi,
          iosBleId: Platform.OS === "ios" ? device.id : cur.iosBleId,
        };
        return next;
      }
      return [
        ...prev,
        {
          id: canonicalId,
          name: device.name ?? null,
          rssi: device.rssi ?? null,
          device,
          canonicalId,
        },
      ];
    });
  }, []);

  const runScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const { done } = bleManager.startScan_new(onDeviceFound, {
        stopAfterMs: 30000,
      });
      await done;
    } finally {
      setScanning(false);
    }
  }, [bleManager, onDeviceFound, scanning]);

  useFocusEffect(
    useCallback(() => {
      console.log("FocusEffect runScan called");

      runScan();

      return () => {
        console.log("FocusEffect cleanup – stopping scan");
        bleManager.stopScan();
      };
    }, [runScan])
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

  const loadRooms = async () => {
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
            })),
          }));
          setRoomsWithBoards(mapped);
          setRooms(mapped.map((m) => m.room));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDevicesDebounced = useDebouncedCallback(
    async (ids: string[]) => {
      try {
        const foundDevices = await fetchDevicesByMac(ids);

        const nearByDevices: Switchboard[] = [];
        foundDevices.forEach((device) => {
          const obj: Switchboard = {
            id: device.device_id,
            name: device.title,
            room_name: device.room_name,
            color:
              SWITCHBOARD_COLORS[
                Math.floor(Math.random() * SWITCHBOARD_COLORS.length)
              ],
            is_online: true,
            icon: device.room_icon,
          };
          nearByDevices.push(obj);
        });

        setSwitchboards(nearByDevices);
        await setNearbyDevicesCache(nearByDevices);
      } catch {
        const cached = await getNearbyDevicesCache();
        if (cached && Array.isArray(cached)) {
          setSwitchboards(cached);
        }
      }
    },
    500,
    { leading: false, trailing: true },
    [fetchDevicesByMac]
  );

  useEffect(() => {
    syncAppData();
    loadRooms();
  }, []);

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
    if (scanning) return;
    if (!devices.length) return;
    if (newBoardModalVisible) return;

    const existing = new Set(
      switchboards.map((s) => String(s.id).toUpperCase())
    );
    const ignored = new Set(ignoredSwitchboards.map((s) => s.toUpperCase()));

    const fresh = devices.find((d) => {
      const id = String(d.canonicalId || d.id).toUpperCase();
      return !existing.has(id) && !ignored.has(id);
    });

    if (fresh) {
      const dismissed = dismissedBoardRef.current;
      const freshId = String(fresh.canonicalId || fresh.id);
      if (dismissed && dismissed.id === freshId && Date.now() - dismissed.at < 120000) {
        return;
      }
      setCandidateDevice(fresh);
      setNewBoardModalVisible(true);
    }
  }, [
    isFocused,
    scanning,
    devices,
    switchboards,
    ignoredSwitchboards,
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

  const closeNewBoardSheet = (markDismissed = false, keepCandidate = false) => {
    Animated.timing(newBoardSheetY, {
      toValue: 280,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setNewBoardModalVisible(false);
      if (markDismissed && candidateDevice) {
        dismissedBoardRef.current = {
          id: String(candidateDevice.canonicalId || candidateDevice.id),
          at: Date.now(),
        };
      }
      if (!keepCandidate) {
        setCandidateDevice(null);
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
            closeNewBoardSheet(true);
          } else {
            Animated.spring(newBoardSheetY, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [newBoardSheetY]
  );

  const handleIgnoreNewBoard = async () => {
    if (!candidateDevice) return;
    const id = String(candidateDevice.canonicalId || candidateDevice.id);
    await addIgnoredSwitchboard(id);
    setIgnoredSwitchboards((prev) => Array.from(new Set([...prev, id])));
    closeNewBoardSheet(true);
  };

  const handleAddNewBoard = async () => {
    if (!candidateDevice) return;
    setNewBoardModalVisible(false);
    newBoardSheetY.setValue(280);
    const pendingId = String(candidateDevice.canonicalId || candidateDevice.id);
    await setPendingSwitchboardDeviceId(pendingId);
    setCandidateDevice(null);
    navigation.navigate("ConfirmNewBoard", {
      pendingDeviceId: pendingId,
    });
  };

  const onlineCount = switchboards.filter((sb) => sb.is_online).length;

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
                const isOnline =
                  switchboard.is_online ||
                  devices.some((d) => d.canonicalId === switchboard.id);
                return (
                <TouchableOpacity
                  key={switchboard.id}
                  style={styles.switchboardCardHorizontal}
                  onPress={() =>
                    navigation.navigate("Switchboard", {
                      switchboardId: switchboard.id,
                      switchboardName: switchboard.name,
                      deviceId: switchboard.id,
                      status: switchboard.is_online,
                      iosBleId: devices.find(
                        (d) => d.canonicalId === switchboard.id
                      )?.iosBleId,
                      bleId: devices.find(
                        (d) => d.canonicalId === switchboard.id
                      )?.device?.id,
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
              )})}
            </View>
          </ScrollView>
        </View>

        {roomsWithBoards.map((item) => {
          const room = item.room;
          const roomSwitchboards = item.devices;
          return (
            <View key={room.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitleSmall}>
                  {room.name} · {room.switchboardCount || roomSwitchboards.length}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.edgeScroll}
              >
                <View style={[styles.switchboardRow, styles.switchboardRowPadded]}>
                  {roomSwitchboards.map((switchboard) => {
                    const isOnline =
                      switchboard.is_online ||
                      devices.some((d) => d.canonicalId === switchboard.id);
                    return (
                    <TouchableOpacity
                  key={switchboard.id}
                  style={styles.switchboardCardHorizontal}
                  onPress={() =>
                    navigation.navigate("Switchboard", {
                      switchboardId: switchboard.id,
                      switchboardName: switchboard.name,
                      deviceId: switchboard.id,
                      status: switchboard.is_online,
                      iosBleId: devices.find(
                        (d) => d.canonicalId === switchboard.id
                      )?.iosBleId,
                      bleId: devices.find(
                        (d) => d.canonicalId === switchboard.id
                      )?.device?.id,
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
                    </TouchableOpacity>
                  )})}
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
            style={[styles.bottomSheet, { transform: [{ translateY: newBoardSheetY }] }]}
          >
            <View style={styles.sheetHandle} {...newBoardPan.panHandlers}>
              <View style={styles.sheetHandleBar} />
            </View>
            <Text style={styles.sheetTitle}>New Switchboard Found</Text>
            <Text style={styles.sheetSubtitle}>
              {candidateDevice?.canonicalId || candidateDevice?.id}
            </Text>
            <Animated.View
              style={{
                alignItems: "center",
                marginBottom: 10,
                transform: [
                  {
                    translateY: boardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -8],
                    }),
                  },
                ],
              }}
            >
              <Image
                source={require("@/assets/images/board-image.png")}
                style={styles.boardHero}
              />
            </Animated.View>
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
  },
  sheetSubtitle: {
    color: "#94a3b8",
    marginTop: 6,
    marginBottom: 16,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
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
  boardHero: {
    width: 240,
    height: 170,
    resizeMode: "contain",
  },
});
