import { addDevice, fetchDevicesByRoomForUser } from "@/api/devics";
import { getRoomsLocal } from "@/db/rooms.local";
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [boardName, setBoardName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const localRooms = await getRoomsLocal();
        if (mounted && localRooms.length) {
          setRooms(localRooms as Room[]);
          if (!selectedRoomId) {
            setSelectedRoomId(localRooms[0].id);
            setSelectedRoom(localRooms[0] as Room);
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
    if (!selectedRoomId) {
      Alert.alert("Select Room", "Please choose a room for this board.");
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
      const addRes = await addDevice({
        title: boardName.trim(),
        room_id: selectedRoomId,
        device_id: pendingDeviceId,
        os: Platform.OS,
      });
      const sensors = extractSensorsFromAddResponse(addRes);
      navigation.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "Switchboard",
            params: {
              switchboardName: boardName.trim(),
              deviceId: pendingDeviceId,
              roomIcon: selectedRoom?.icon || "",
              status: true,
              iosBleId: Platform.OS === "ios" ? (bleTransportId || pendingDeviceId) : undefined,
              bleId: bleTransportId || pendingDeviceId,
              service_id: "",
              roomName: selectedRoom?.name || "",
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
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

        <Text style={styles.label}>Select Room</Text>
        <ScrollView style={styles.roomList} contentContainerStyle={styles.roomListContent}>
          {rooms.map((room) => (
                <TouchableOpacity
                  key={room.id}
                  style={[
                    styles.roomRow,
                    selectedRoomId === room.id && styles.roomRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedRoomId(room.id);
                    setSelectedRoom(room);
                  }}
                >
                  <Text style={styles.roomRowText}>{room.name}</Text>
                </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButtonGhost} onPress={() => navigation.goBack()}>
          <Text style={styles.footerGhostText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerButton, saving && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.footerButtonText}>Save</Text>
          )}
        </TouchableOpacity>
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
