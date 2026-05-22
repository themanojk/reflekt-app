import {
  openAppPermissionSettings,
  requestWifiScanPermission,
} from "@/services/appPermissions";
import { getAvailableWifiNetworks, WifiNetwork } from "@/services/wifiScanner";
import { X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

type EntryMode = "network" | "manual";

type WifiConfigModalProps = {
  visible: boolean;
  initialSSID: string;
  initialPassword: string;
  onClose: () => void;
  onSubmit: (config: { ssid: string; password: string }) => Promise<void> | void;
};

export default function WifiConfigModal({
  visible,
  initialSSID,
  initialPassword,
  onClose,
  onSubmit,
}: WifiConfigModalProps) {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("network");
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");

  const loadNetworks = React.useCallback(
    async (opts?: { requestPermission?: boolean }) => {
      if (Platform.OS !== "android") {
        setWifiNetworks([]);
        return;
      }

      if (opts?.requestPermission !== false) {
        const permission = await requestWifiScanPermission();
        if (permission !== "granted") {
          setWifiNetworks([]);
          setPermissionMessage(
            "Allow nearby WiFi access to see available networks on this device.",
          );
          return;
        }
      }

      setPermissionMessage("");
      setLoadingNetworks(true);
      try {
        const networks = await getAvailableWifiNetworks();
        setWifiNetworks(networks);
        const hasMatchingInitial = !!initialSSID
          && networks.some((network) => network.ssid === initialSSID);

        if (hasMatchingInitial) {
          setEntryMode("network");
          return;
        }

        if (initialSSID) {
          setEntryMode("manual");
          return;
        }

        const preferredNetwork =
          networks.find((network) => network.isCurrent) || networks[0];
        if (preferredNetwork) {
          setEntryMode("network");
          setSsid(preferredNetwork.ssid);
        } else {
          setEntryMode("manual");
        }
      } catch (error) {
        console.warn("[WIFI_CONFIG_MODAL] failed to load networks", error);
        setWifiNetworks([]);
        setPermissionMessage(
          "Unable to load WiFi networks right now. You can type the SSID manually.",
        );
        setEntryMode(initialSSID ? "manual" : "network");
      } finally {
        setLoadingNetworks(false);
      }
    },
    [initialSSID],
  );

  useEffect(() => {
    if (!visible) return;

    setSsid(initialSSID);
    setPassword(initialPassword);
    setSaving(false);
    setPermissionMessage("");
    setEntryMode(initialSSID ? "manual" : "network");
    void loadNetworks();
  }, [initialPassword, initialSSID, loadNetworks, visible]);

  const selectNetwork = (network: WifiNetwork) => {
    setEntryMode("network");
    setSsid(network.ssid);
    if (network.ssid === initialSSID) {
      setPassword(initialPassword);
    } else {
      setPassword("");
    }
  };

  const selectManual = () => {
    setEntryMode("manual");
    if (ssid === initialSSID) return;
    setSsid("");
  };

  const handleSubmit = async () => {
    if (!ssid.trim()) {
      Alert.alert("Error", "Please choose a WiFi network or type one manually.");
      return;
    }

    if (!password.trim() || password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({ ssid: ssid.trim(), password });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKeyboardWrap}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure WiFi</Text>
              <Pressable
                onPress={onClose}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 30 }}
                pressRetentionOffset={16}
                style={({ pressed }) => [
                  styles.closeIconButton,
                  pressed && styles.closeIconButtonPressed,
                ]}
              >
                <X size={24} color="#94a3b8" />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              style={styles.modalBody}
              enableOnAndroid
              extraScrollHeight={24}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Available WiFi</Text>
                <View style={styles.dropdownCard}>
                  {loadingNetworks ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color="#93c5fd" size="small" />
                      <Text style={styles.loadingText}>Loading WiFi networks...</Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.dropdownScroll}
                      contentContainerStyle={styles.dropdownScrollContent}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {wifiNetworks.length ? (
                        wifiNetworks.map((network) => {
                          const selected =
                            entryMode === "network" && ssid === network.ssid;
                          return (
                            <TouchableOpacity
                              key={`${network.ssid}-${network.bssid || "ssid"}`}
                              style={[
                                styles.networkRow,
                                selected && styles.networkRowSelected,
                              ]}
                              onPress={() => selectNetwork(network)}
                            >
                              <View style={styles.networkInfo}>
                                <Text
                                  style={[
                                    styles.networkName,
                                    selected && styles.networkNameSelected,
                                  ]}
                                >
                                  {network.ssid}
                                </Text>
                                <Text style={styles.networkMeta}>
                                  Signal{" "}
                                  {typeof network.level === "number"
                                    ? `${network.level} dBm`
                                    : "N/A"}
                                  {network.isCurrent ? " • Current network" : ""}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.networkAction,
                                  selected && styles.networkActionSelected,
                                ]}
                              >
                                {selected ? "Selected" : "Use"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <Text style={styles.emptyWifiText}>No WiFi found</Text>
                      )}

                      <TouchableOpacity
                        style={[
                          styles.networkRow,
                          styles.manualRow,
                          entryMode === "manual" && styles.networkRowSelected,
                        ]}
                        onPress={selectManual}
                      >
                        <View style={styles.networkInfo}>
                          <Text
                            style={[
                              styles.networkName,
                              entryMode === "manual" &&
                                styles.networkNameSelected,
                            ]}
                          >
                            Manually Type
                          </Text>
                          <Text style={styles.networkMeta}>
                            Enter an SSID that is not shown above.
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.networkAction,
                            entryMode === "manual" &&
                              styles.networkActionSelected,
                          ]}
                        >
                          {entryMode === "manual" ? "Selected" : "Choose"}
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  )}
                </View>
                {!!permissionMessage && (
                  <View style={styles.helperRow}>
                    <Text style={styles.helperText}>{permissionMessage}</Text>
                    {Platform.OS === "android" ? (
                      <View style={styles.helperActions}>
                        <TouchableOpacity onPress={() => void loadNetworks()}>
                          <Text style={styles.helperLink}>Allow WiFi Access</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={openAppPermissionSettings}>
                          <Text style={styles.helperLink}>Open Settings</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                )}
              </View>

              {entryMode === "manual" && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Network Name (SSID)</Text>
                  <TextInput
                    style={styles.input}
                    value={ssid}
                    onChangeText={setSsid}
                    placeholder="Enter WiFi network name"
                    placeholderTextColor="#64748b"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter WiFi password"
                  placeholderTextColor="#64748b"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                />
              </View>
            </KeyboardAwareScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Configuration</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalKeyboardWrap: {
    width: "100%",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 18,
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#334155",
    height: "72%",
    minHeight: 420,
  },
  modalBody: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#fff",
  },
  closeIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIconButtonPressed: {
    opacity: 0.88,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 6,
  },
  dropdownCard: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    maxHeight: 140,
  },
  dropdownScroll: {
    maxHeight: 140,
  },
  dropdownScrollContent: {
    flexGrow: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 12,
  },
  networkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  manualRow: {
    borderBottomWidth: 0,
  },
  networkRowSelected: {
    backgroundColor: "rgba(59, 130, 246, 0.14)",
  },
  networkInfo: {
    flex: 1,
    paddingRight: 12,
  },
  networkName: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "600",
  },
  networkNameSelected: {
    color: "#bfdbfe",
  },
  networkMeta: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 2,
  },
  networkAction: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "700",
  },
  networkActionSelected: {
    color: "#bfdbfe",
  },
  emptyWifiText: {
    color: "#94a3b8",
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  helperRow: {
    marginTop: 8,
  },
  helperActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
  },
  helperText: {
    color: "#94a3b8",
    fontSize: 10,
    lineHeight: 14,
  },
  helperLink: {
    color: "#60a5fa",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
  },
  footer: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  saveButton: {
    backgroundColor: "#5b8def",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 2,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
