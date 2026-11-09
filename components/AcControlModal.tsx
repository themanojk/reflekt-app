import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";

export type AcMode = "cool" | "dry" | "fan" | "auto" | "heat";
export type AcFanSpeed = "auto" | "low" | "medium" | "high" | "max";
export type AcPowerMode = "normal" | "eco" | "turbo" | "sleep";

export interface AcControlState {
  power: boolean;
  temperature: number;
  mode: AcMode;
  fan: AcFanSpeed;
  swing: boolean;
  powerMode: AcPowerMode;
}

type Props = {
  visible: boolean;
  title: string;
  value: AcControlState;
  busy?: boolean;
  onClose: () => void;
  onChange: (next: AcControlState) => void;
  onCommit: (next: AcControlState) => void;
};

const MODE_OPTIONS: AcMode[] = ["cool", "dry", "fan", "auto", "heat"];
const FAN_OPTIONS: AcFanSpeed[] = ["auto", "low", "medium", "high", "max"];
const POWER_MODE_OPTIONS: AcPowerMode[] = ["normal", "eco", "turbo", "sleep"];
const TEMPERATURE_OPTIONS = Array.from({ length: 13 }, (_, index) => 18 + index);

const formatLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export default function AcControlModal({
  visible,
  title,
  value,
  busy = false,
  onClose,
  onChange,
  onCommit,
}: Props) {
  const update = (patch: Partial<AcControlState>) => {
    const next = { ...value, ...patch };
    onChange(next);
    onCommit(next);
  };

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

          <View style={styles.section}>
            <Text style={styles.label}>Power</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.toggleChip, value.power && styles.toggleChipActive]}
                onPress={() => update({ power: true })}
              >
                <Text style={[styles.toggleChipText, value.power && styles.toggleChipTextActive]}>
                  On
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleChip, !value.power && styles.toggleChipActive]}
                onPress={() => update({ power: false })}
              >
                <Text style={[styles.toggleChipText, !value.power && styles.toggleChipTextActive]}>
                  Off
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Temperature</Text>
            <View style={styles.optionWrap}>
              {TEMPERATURE_OPTIONS.map((temperature) => (
                <TouchableOpacity
                  key={temperature}
                  style={[
                    styles.optionChip,
                    styles.temperatureChip,
                    value.temperature === temperature && styles.optionChipActive,
                  ]}
                  onPress={() => update({ temperature, power: true })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      value.temperature === temperature &&
                        styles.optionChipTextActive,
                    ]}
                  >
                    {temperature}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Mode</Text>
            <View style={styles.optionWrap}>
              {MODE_OPTIONS.map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.optionChip, value.mode === mode && styles.optionChipActive]}
                  onPress={() => update({ mode, power: true })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      value.mode === mode && styles.optionChipTextActive,
                    ]}
                  >
                    {formatLabel(mode)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Fan</Text>
            <View style={styles.optionWrap}>
              {FAN_OPTIONS.map((fan) => (
                <TouchableOpacity
                  key={fan}
                  style={[styles.optionChip, value.fan === fan && styles.optionChipActive]}
                  onPress={() => update({ fan, power: true })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      value.fan === fan && styles.optionChipTextActive,
                    ]}
                  >
                    {formatLabel(fan)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Swing</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.toggleChip, value.swing && styles.toggleChipActive]}
                onPress={() => update({ swing: true, power: true })}
              >
                <Text style={[styles.toggleChipText, value.swing && styles.toggleChipTextActive]}>
                  On
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleChip, !value.swing && styles.toggleChipActive]}
                onPress={() => update({ swing: false })}
              >
                <Text style={[styles.toggleChipText, !value.swing && styles.toggleChipTextActive]}>
                  Off
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Power Mode</Text>
            <View style={styles.optionWrap}>
              {POWER_MODE_OPTIONS.map((powerMode) => (
                <TouchableOpacity
                  key={powerMode}
                  style={[
                    styles.optionChip,
                    value.powerMode === powerMode && styles.optionChipActive,
                  ]}
                  onPress={() => update({ powerMode, power: true })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      value.powerMode === powerMode && styles.optionChipTextActive,
                    ]}
                  >
                    {formatLabel(powerMode)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeFooterButton}
            onPress={onClose}
          >
            <Text style={styles.closeFooterButtonText}>
              {busy ? "Sending..." : "Close"}
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
  row: {
    flexDirection: "row",
    gap: 10,
  },
  toggleChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0f172a",
  },
  toggleChipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  toggleChipText: {
    color: "#cbd5e1",
    fontWeight: "700",
  },
  toggleChipTextActive: {
    color: "#eff6ff",
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  temperatureChip: {
    minWidth: 64,
    alignItems: "center",
  },
  optionChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#0f172a",
  },
  optionChipActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#082f49",
  },
  optionChipText: {
    color: "#cbd5e1",
    fontWeight: "600",
  },
  optionChipTextActive: {
    color: "#e0f2fe",
  },
  closeFooterButton: {
    marginTop: 6,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  closeFooterButtonText: {
    color: "#e2e8f0",
    fontWeight: "700",
    fontSize: 15,
  },
});
