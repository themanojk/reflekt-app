import { addRoom } from "@/api/room";
import LiquidTouchable from "@/components/LiquidTouchable";
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
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useAuth } from "../contexts/AuthContext";

const ROOM_ICONS = [
  { name: "home", icon: Home, label: "Home" },
  { name: "bed", icon: Bed, label: "Bedroom" },
  { name: "coffee", icon: Coffee, label: "Kitchen" },
  { name: "tv", icon: Tv, label: "Living Room" },
  { name: "bath", icon: Bath, label: "Bathroom" },
  { name: "utensils", icon: Utensils, label: "Dining" },
  { name: "sofa", icon: Sofa, label: "Lounge" },
  { name: "lamp", icon: Lamp, label: "Study" },
];

export default function AddRoomScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("home");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleAddRoom = async () => {
    console.log("Adding room with name:", name, "and icon:", selectedIcon);
    if (!name.trim()) {
      Alert.alert("Error", "Please enter a room name");
      return;
    }

    setLoading(true);

    await addRoom(name, selectedIcon);
    setLoading(false);
    Alert.alert("Success", `Room "${name.trim()}" added successfully!`);
    navigation.goBack();
  };

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      enableOnAndroid
      extraScrollHeight={16}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.header}>
        <LiquidTouchable onPress={() => navigation.goBack()} borderRadius={16}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </LiquidTouchable>
        <Text style={styles.title}>Add Room</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.hintContainer}>
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Tip: On Home screen, long press a room to remove it.
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Room Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Living Room"
          placeholderTextColor="#64748b"
          value={name}
          onChangeText={setName}
          autoFocus
          editable={!loading}
        />

        <Text style={styles.label}>Select Icon</Text>
        <View style={styles.iconGrid}>
          {ROOM_ICONS.map((item) => {
            const IconComponent = item.icon;
            const isSelected = selectedIcon === item.name;
            return (
              <Pressable
                key={item.name}
                style={({ pressed }) => [
                  styles.iconButton,
                  isSelected && styles.iconButtonSelected,
                  pressed && styles.iconButtonPressed,
                ]}
                onPress={() => setSelectedIcon(item.name)}
                android_ripple={{
                  color: "rgba(59, 130, 246, 0.14)",
                  borderless: false,
                }}
                hitSlop={8}
                pressRetentionOffset={12}
                disabled={loading}
              >
                <IconComponent
                  size={28}
                  color={isSelected ? "#3b82f6" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.iconLabel,
                    isSelected && styles.iconLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <LiquidTouchable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddRoom}
          disabled={loading}
          borderRadius={18}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Room</Text>
          )}
        </LiquidTouchable>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  container: {
    paddingBottom: 24,
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
  hintContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  hintBox: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    borderLeftWidth: 3,
    borderLeftColor: "#60a5fa",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  hintText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 18,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e2e8f0",
    marginTop: 16,
    marginBottom: 12,
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
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  iconButton: {
    width: "23%",
    aspectRatio: 1,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#334155",
    padding: 8,
    marginBottom: 12,
  },
  iconButtonPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.98 }],
  },
  iconButtonSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#1e3a8a",
  },
  iconLabel: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 4,
    textAlign: "center",
  },
  iconLabelSelected: {
    color: "#3b82f6",
    fontWeight: "600",
  },
});
