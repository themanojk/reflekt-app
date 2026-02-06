import { fetchDevicesByMac, fetchDevicesByRoomForUser } from "@/api/devics";
import { useDebouncedCallback } from "@/callbacks/useDeboundcedCallback";
import { getRoomsLocal } from "@/db/rooms.local";
import { syncAppData } from "@/db_sync/app_sync";
import { getCanonicalId } from "@/services/bleCanonicalId";
import BLEManagerService from "@/services/bleManager";
import { useFocusEffect } from "@react-navigation/native";
import { Plus, User } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Platform,
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
  const bleManager = new BLEManagerService();
  const [scanning, setScanning] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsWithBoards, setRoomsWithBoards] = useState<
    { room: Room; devices: Switchboard[] }[]
  >([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [switchboards, setSwitchboards] = useState<Switchboard[]>([]);
  const [loading, setLoading] = useState(false);

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
    // Platform-aware canonical id (only iOS)
    let canonicalId = device.id;
    if (Platform.OS === "ios") {
      try {
        canonicalId = await getCanonicalId(device);
        console.log(`Canonical ID for device ${device.id} is ${canonicalId}`);
      } catch (e) {
        console.warn("canonicalId lookup failed; fallback to device.id", e);
        canonicalId = device.id;
      }
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

      const byRoom = await fetchDevicesByRoomForUser();
      if (Array.isArray(byRoom)) {
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
    } finally {
      setLoading(false);
    }
  };

  const fetchDevicesDebounced = useDebouncedCallback(
    async (ids: string[]) => {
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
    if (!devices.length) return;
    const deviceIds = devices.map((d) => d.id);
    fetchDevicesDebounced(deviceIds);

    return () => fetchDevicesDebounced.cancel();
  }, [devices, fetchDevicesDebounced]);

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
});
