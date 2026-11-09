import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import CustomSlider from "./CustomSlider";

export type RgbPaletteColor = {
  key: string;
  label: string;
  hex: string;
};

type Props = {
  visible: boolean;
  title: string;
  colors: RgbPaletteColor[];
  selectedColorKey: string;
  brightness: number;
  busy?: boolean;
  onClose: () => void;
  onSelectColor: (key: string) => void;
  onBrightnessChange: (value: number) => void;
  onApply: () => void;
};

export default function RgbLightControlModal({
  visible,
  title,
  colors,
  selectedColorKey,
  brightness,
  busy = false,
  onClose,
  onSelectColor,
  onBrightnessChange,
  onApply,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeButton}>
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.label}>Color Palette</Text>
              <View style={styles.paletteGrid}>
                {colors.map((color) => {
                  const active = color.key === selectedColorKey;
                  return (
                    <TouchableOpacity
                      key={color.key}
                      style={[
                        styles.colorCard,
                        active && styles.colorCardActive,
                      ]}
                      onPress={() => onSelectColor(color.key)}
                    >
                      <View
                        style={[styles.colorSwatch, { backgroundColor: color.hex }]}
                      />
                      <Text
                        style={[
                          styles.colorLabel,
                          active && styles.colorLabelActive,
                        ]}
                      >
                        {color.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Brightness: {brightness}%</Text>
              <CustomSlider
                value={brightness}
                minimumValue={0}
                maximumValue={100}
                step={5}
                onValueChange={onBrightnessChange}
                minimumTrackTintColor="#5b8def"
                maximumTrackTintColor="#334155"
                thumbTintColor="#5b8def"
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.applyButton, busy && styles.buttonDisabled]}
            onPress={onApply}
            disabled={busy}
          >
            <Text style={styles.applyButtonText}>
              {busy ? "Applying..." : "Apply"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: "#111827",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  section: {
    marginBottom: 18,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorCard: {
    width: "30%",
    minWidth: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    padding: 10,
    alignItems: "center",
    gap: 8,
  },
  colorCardActive: {
    borderColor: "#5b8def",
    backgroundColor: "rgba(91, 141, 239, 0.18)",
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  colorLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  colorLabelActive: {
    color: "#eff6ff",
  },
  applyButton: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  applyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
