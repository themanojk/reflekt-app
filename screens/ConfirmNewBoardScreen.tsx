import { addDevice, fetchDevicesByRoomForUser } from "@/api/devics";
import { addRoom } from "@/api/room";
import LiquidTouchable from "@/components/LiquidTouchable";
import { useToast } from "@/contexts/ToastContext";
import { getRoomsLocal } from "@/db/rooms.local";
import { clearPendingSwitchboardDeviceId } from "@/utils/storage";
import {
  Bath,
  Bed,
  Coffee,
  Hop as Home,
  Lamp,
  Sofa,
  Tv,
  Utensils,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Room = {
  id: string;
  name: string;
  icon?: string;
};

const ROOM_ICON_OPTIONS = [
  { name: "home", icon: Home, label: "Home" },
  { name: "bed", icon: Bed, label: "Bedroom" },
  { name: "coffee", icon: Coffee, label: "Kitchen" },
  { name: "tv", icon: Tv, label: "Living Room" },
  { name: "bath", icon: Bath, label: "Bathroom" },
  { name: "utensils", icon: Utensils, label: "Dining" },
  { name: "sofa", icon: Sofa, label: "Lounge" },
  { name: "lamp", icon: Lamp, label: "Study" },
];

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

export default function ConfirmNewBoardScreen({ navigation, route }: any) {
  const { pendingDeviceId, bleTransportId } = route.params || {};
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [boardName, setBoardName] = useState("");
  const [createRoomMode, setCreateRoomMode] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomIcon, setNewRoomIcon] = useState("home");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const localRooms = await getRoomsLocal();
        if (mounted) {
          setCreateRoomMode(localRooms.length === 0);
          if (localRooms.length) {
            setRooms(localRooms as Room[]);
            if (!selectedRoomId) {
              setSelectedRoomId(localRooms[0].id);
              setSelectedRoom(localRooms[0] as Room);
            }
          }
        }
        const byRoom = await fetchDevicesByRoomForUser();
        if (mounted && Array.isArray(byRoom)) {
          const nextRooms: Room[] = byRoom.map((r) => ({
            id: r.room?.id,
            name: r.room?.name,
            icon: r.room?.icon,
          }));
          const unique = new Map<string, Room>();
          nextRooms.forEach((r) => {
            if (r?.id) unique.set(r.id, r);
          });
          const roomsList = Array.from(unique.values());
          setRooms(roomsList);
          setCreateRoomMode(roomsList.length === 0);
          if (!selectedRoomId && roomsList.length) {
            setSelectedRoomId(roomsList[0].id);
            setSelectedRoom(roomsList[0]);
          }
        }
      } catch {
        // ignore; local rooms are already used
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleContinue = async () => {
    const shouldCreateRoom = createRoomMode || rooms.length === 0;
    if (!shouldCreateRoom && !selectedRoomId) {
      Alert.alert("Select Room", "Please choose a room for this board.");
      return;
    }
    if (shouldCreateRoom && !newRoomName.trim()) {
      Alert.alert("Room Name", "Please enter a room name.");
      return;
    }
    if (!boardName.trim()) {
      Alert.alert("Board Name", "Please enter a board name.");
      return;
    }
    if (!pendingDeviceId) {
      Alert.alert("Device Missing", "No device found for this board.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      let roomId = selectedRoomId;
      let roomForNav = selectedRoom;

      if (shouldCreateRoom) {
        const createdRoom = await addRoom(newRoomName.trim(), newRoomIcon);
        roomId = createdRoom?._id || (createdRoom as any)?.id;
        roomForNav = {
          id: roomId,
          name: createdRoom?.name || newRoomName.trim(),
          icon: createdRoom?.icon || newRoomIcon,
        };
        setRooms((prev) =>
          roomId && !prev.some((room) => room.id === roomId)
            ? [...prev, roomForNav as Room]
            : prev,
        );
        setSelectedRoomId(roomId || null);
        setSelectedRoom(roomForNav);
      }

      if (!roomId) {
        Alert.alert("Room Missing", "Unable to create or select a room.");
        return;
      }

      const addRes = await addDevice({
        title: boardName.trim(),
        room_id: roomId,
        device_id: pendingDeviceId,
        os: Platform.OS,
      });
      const sensors = extractSensorsFromAddResponse(addRes);
      await clearPendingSwitchboardDeviceId();
      showToast(`Device "${boardName.trim()}" added successfully.`);
      navigation.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "Switchboard",
            params: {
              switchboardName: boardName.trim(),
              deviceId: pendingDeviceId,
              roomIcon: roomForNav?.icon || "",
              status: true,
              iosBleId: Platform.OS === "ios" ? (bleTransportId || pendingDeviceId) : undefined,
              bleId: bleTransportId || pendingDeviceId,
              service_id: "",
              roomName: roomForNav?.name || "",
              sensors,
            },
          },
        ],
      });
    } catch (e) {
      Alert.alert("Failed", "Unable to add switchboard");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LiquidTouchable onPress={() => navigation.goBack()} borderRadius={16}>
          <Text style={styles.backButton}>Cancel</Text>
        </LiquidTouchable>
        <Text style={styles.title}>New Board</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Board Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Living Room Board"
          placeholderTextColor="#64748b"
          value={boardName}
          onChangeText={setBoardName}
        />

        {!createRoomMode && rooms.length > 0 ? (
          <>
            <Text style={styles.label}>Select Room</Text>
            <ScrollView style={styles.roomList} contentContainerStyle={styles.roomListContent}>
              {rooms.map((room) => (
                <LiquidTouchable
                  key={room.id}
                  style={[
                    styles.roomRow,
                    selectedRoomId === room.id && styles.roomRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedRoomId(room.id);
                    setSelectedRoom(room);
                  }}
                  borderRadius={16}
                >
                  <Text style={styles.roomRowText}>{room.name}</Text>
                </LiquidTouchable>
              ))}
            </ScrollView>
            <LiquidTouchable
              style={styles.inlineAction}
              onPress={() => setCreateRoomMode(true)}
              borderRadius={16}
            >
              <Text style={styles.inlineActionText}>Create New Room</Text>
            </LiquidTouchable>
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {rooms.length === 0 ? "Create Room" : "Create New Room"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Living Room"
              placeholderTextColor="#64748b"
              value={newRoomName}
              onChangeText={setNewRoomName}
            />
            <Text style={styles.label}>Select Room Type</Text>
            <View style={styles.iconGrid}>
              {ROOM_ICON_OPTIONS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = newRoomIcon === item.name;
                return (
                  <LiquidTouchable
                    key={item.name}
                    style={[
                      styles.iconButton,
                      isSelected && styles.iconButtonSelected,
                    ]}
                    onPress={() => setNewRoomIcon(item.name)}
                    borderRadius={18}
                  >
                    <IconComponent
                      size={24}
                      color={isSelected ? "#5b8def" : "#94a3b8"}
                    />
                    <Text
                      style={[
                        styles.iconLabel,
                        isSelected && styles.iconLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </LiquidTouchable>
                );
              })}
            </View>
            {rooms.length > 0 ? (
              <LiquidTouchable
                style={styles.inlineAction}
                onPress={() => setCreateRoomMode(false)}
                borderRadius={16}
              >
                <Text style={styles.inlineActionText}>Back To Room Selection</Text>
              </LiquidTouchable>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.footer}>
        <LiquidTouchable
          style={styles.footerButtonGhost}
          onPress={() => navigation.goBack()}
          borderRadius={18}
        >
          <Text style={styles.footerGhostText}>Cancel</Text>
        </LiquidTouchable>
        <LiquidTouchable
          style={[styles.footerButton, saving && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={saving}
          borderRadius={18}
        >
          {saving ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.footerButtonText}>Save</Text>
          )}
        </LiquidTouchable>
      </View>
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
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backButton: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "700",
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 14,
  },
  label: {
    color: "#94a3b8",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.6,
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 12,
    color: "#e2e8f0",
    backgroundColor: "#0b1220",
  },
  roomList: {
    flex: 1,
    maxHeight: 260,
  },
  roomListContent: {
    paddingBottom: 12,
  },
  roomRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 10,
  },
  roomRowSelected: {
    borderColor: "#5b8def",
    backgroundColor: "rgba(91, 141, 239, 0.12)",
  },
  roomRowText: {
    color: "#e2e8f0",
    fontWeight: "600",
  },
  inlineAction: {
    alignSelf: "flex-start",
    marginTop: 6,
  },
  inlineActionText: {
    color: "#93c5fd",
    fontWeight: "600",
    fontSize: 13,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  iconButton: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0b1220",
    padding: 8,
  },
  iconButtonSelected: {
    borderColor: "#5b8def",
    backgroundColor: "rgba(91, 141, 239, 0.12)",
  },
  iconLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  iconLabelSelected: {
    color: "#dbeafe",
  },
  footer: {
    padding: 20,
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },
  footerButton: {
    flex: 1,
    backgroundColor: "#5b8def",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  footerButtonText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  footerButtonGhost: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  footerGhostText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
