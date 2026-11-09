import { X } from "lucide-react-native";
import React from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

type SensorPairingSheetStep = "prompt" | "attached";

type SensorPairingSheetContentProps = {
  step: SensorPairingSheetStep;
  sensorMac: string | null;
  attachInFlight?: boolean;
  rotation: Animated.Value;
  promptTitle?: string;
  attachedTitle?: string;
  deviceLabel?: string;
  attachLabel?: string;
  attachingLabel?: string;
  ignoreLabel?: string;
  removeLabel?: string;
  onClose: () => void;
  onIgnore: () => void;
  onAttach: () => void;
  onRemove: () => void;
};

function SensorHero({ rotation }: { rotation: Animated.Value }) {
  return (
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
            <LinearGradient id="front" x1="0" y1="0" x2="1" y2="1">
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
            <LinearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="rgba(255,255,255,0.7)" />
              <Stop offset="0.5" stopColor="rgba(255,255,255,0.2)" />
              <Stop offset="1" stopColor="rgba(255,255,255,0)" />
            </LinearGradient>
            <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#f8fafc" />
              <Stop offset="1" stopColor="#cbd5e1" />
            </LinearGradient>
            <LinearGradient id="baseShadow" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(15,23,42,0.35)" />
              <Stop offset="1" stopColor="rgba(15,23,42,0)" />
            </LinearGradient>
          </Defs>
          <Circle cx="84" cy="140" r="26" fill="url(#baseShadow)" />
          <Polygon points="22,18 34,28 134,28 122,18" fill="url(#top)" />
          <Polygon points="122,18 134,28 134,146 122,136" fill="url(#side)" />
          <Rect x="22" y="18" width="100" height="118" rx="12" fill="url(#front)" />
          <Rect
            x="25"
            y="21"
            width="94"
            height="112"
            rx="10"
            fill="none"
            stroke="url(#edge)"
          />
          <Rect x="58" y="54" width="46" height="46" rx="7" fill="#e9eef5" stroke="#cbd5e1" />
          <Circle cx="81" cy="77" r="18.5" fill="url(#dome)" stroke="#b6c2d1" />
          <Circle cx="75" cy="70" r="6" fill="rgba(255,255,255,0.7)" />
          <Rect x="26" y="20" width="86" height="30" rx="9" fill="url(#gloss)" />
          <Circle cx="74" cy="74" r="2" fill="#b6c2d1" />
          <Circle cx="81" cy="72" r="2" fill="#b6c2d1" />
          <Circle cx="88" cy="74" r="2" fill="#b6c2d1" />
          <Circle cx="74" cy="81" r="2" fill="#b6c2d1" />
          <Circle cx="81" cy="83" r="2" fill="#b6c2d1" />
          <Circle cx="88" cy="81" r="2" fill="#b6c2d1" />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default function SensorPairingSheetContent({
  step,
  sensorMac,
  attachInFlight = false,
  rotation,
  promptTitle = "Motion Sensor Found",
  attachedTitle = "Sensor Attached",
  deviceLabel = "sensor",
  attachLabel = "Attach",
  attachingLabel = "Attaching...",
  ignoreLabel = "Ignore",
  removeLabel = "Remove Sensor",
  onClose,
  onIgnore,
  onAttach,
  onRemove,
}: SensorPairingSheetContentProps) {
  const normalizedLabel = deviceLabel.trim() || "sensor";

  return (
    <>
      {step === "prompt" && (
        <>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{promptTitle}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              pressRetentionOffset={16}
              style={({ pressed }) => [
                styles.closeIconButton,
                pressed && styles.closeIconButtonPressed,
              ]}
            >
              <X size={22} color="#94a3b8" />
            </Pressable>
          </View>
          <SensorHero rotation={rotation} />
          <Text style={styles.sheetText}>
            {normalizedLabel.charAt(0).toUpperCase() + normalizedLabel.slice(1)} {sensorMac} is
            nearby. Do you want to attach it to this switchboard?
          </Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              disabled={attachInFlight}
              onPress={onIgnore}
            >
              <Text style={styles.sheetBtnGhostText}>{ignoreLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sheetBtn,
                styles.sheetBtnPrimary,
                attachInFlight && styles.disabledButton,
              ]}
              disabled={attachInFlight}
              onPress={onAttach}
            >
              <Text style={styles.sheetBtnPrimaryText}>
                {attachInFlight ? attachingLabel : attachLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === "attached" && (
        <>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{attachedTitle}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              pressRetentionOffset={16}
              style={({ pressed }) => [
                styles.closeIconButton,
                pressed && styles.closeIconButtonPressed,
              ]}
            >
              <X size={22} color="#94a3b8" />
            </Pressable>
          </View>
          <SensorHero rotation={rotation} />
          <Text style={styles.sheetText}>
            {normalizedLabel.charAt(0).toUpperCase() + normalizedLabel.slice(1)} {sensorMac} is
            attached to this hub. You can remove it if needed.
          </Text>
          <TouchableOpacity style={styles.dangerButton} onPress={onRemove}>
            <Text style={styles.dangerButtonText}>{removeLabel}</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  closeIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
  },
  closeIconButtonPressed: {
    opacity: 0.86,
  },
  dangerButton: {
    marginTop: 18,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#7f1d1d",
    borderWidth: 1,
    borderColor: "#b91c1c",
  },
  dangerButtonText: {
    color: "#fee2e2",
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.7,
  },
  sensorHero: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  sensorSpin: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
  },
  sheetBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBtnGhost: {
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  sheetBtnGhostText: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "700",
  },
  sheetBtnPrimary: {
    backgroundColor: "#2563eb",
  },
  sheetBtnPrimaryText: {
    color: "#eff6ff",
    fontSize: 15,
    fontWeight: "800",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetText: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  sheetTitle: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800",
  },
});
