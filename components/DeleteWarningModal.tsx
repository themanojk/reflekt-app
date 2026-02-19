import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { AlertTriangle } from "lucide-react-native";

type DetailItem = {
  label: string;
  value: string;
  highlight?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  message: string;
  warningText?: string;
  details?: DetailItem[];
  loading?: boolean;
  processing?: boolean;
  errorText?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteWarningModal({
  visible,
  title,
  message,
  warningText,
  details = [],
  loading = false,
  processing = false,
  errorText,
  confirmLabel = "Remove",
  onCancel,
  onConfirm,
}: Props) {
  let OptionalBlurView: any = null;
  let canUseNativeBlur = false;
  try {
    OptionalBlurView = require("expo-blur").BlurView;
    canUseNativeBlur =
      Platform.OS === "ios" ||
      Platform.OS === "android"
        ? !!UIManager.getViewManagerConfig?.("ExpoBlurView")
        : false;
  } catch {}

  const Backdrop = OptionalBlurView && canUseNativeBlur ? (
    <OptionalBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
  ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        {Backdrop}
        <View style={styles.overlayTint} />
        <View style={styles.card}>
          <View style={styles.warningRow}>
            <AlertTriangle size={18} color="#f97316" strokeWidth={2.4} />
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.message}>{message}</Text>

          {!!warningText && <Text style={styles.warningText}>{warningText}</Text>}

          {!!details.length && (
            <View style={styles.detailBox}>
              {details.map((item) => (
                <View style={styles.detailRow} key={`${item.label}:${item.value}`}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text
                    style={[styles.detailValue, item.highlight && styles.detailValueHighlight]}
                  >
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color="#5b8def" />
              <Text style={styles.loaderText}>Fetching current switch status...</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={onCancel}
                disabled={processing}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.removeBtn, processing && styles.removeBtnDisabled]}
                onPress={onConfirm}
                disabled={processing}
              >
                <Text style={styles.removeBtnText}>
                  {processing ? "Removing..." : confirmLabel}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  overlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3, 7, 18, 0.55)",
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
  },
  message: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  warningText: {
    marginTop: 10,
    color: "#fbbf24",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  detailBox: {
    marginTop: 12,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  detailLabel: {
    color: "#94a3b8",
    fontSize: 12,
  },
  detailValue: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
  },
  detailValueHighlight: {
    color: "#f59e0b",
  },
  errorText: {
    marginTop: 10,
    color: "#fbbf24",
    fontSize: 12,
  },
  loaderWrap: {
    marginTop: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loaderText: {
    color: "#93c5fd",
    fontSize: 12,
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(148, 163, 184, 0.2)",
  },
  cancelBtnText: {
    color: "#e2e8f0",
    fontWeight: "600",
    fontSize: 13,
  },
  removeBtn: {
    backgroundColor: "#d97706",
  },
  removeBtnDisabled: {
    opacity: 0.7,
  },
  removeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
