import {
  openAppPermissionSettings,
  requestWifiScanPermission,
} from "@/services/appPermissions";
import { getAvailableWifiNetworks, WifiNetwork } from "@/services/wifiScanner";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { ChevronLeft } from "lucide-react-native";
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

type EntryMode = "network" | "manual";

export default function WifiConfigScreen({ navigation, route }: any) {
  const initialSSID = route.params?.initialSSID || "";
  const initialPassword = route.params?.initialPassword || "";
  const onSave = route.params?.onSave as
    | ((config: { ssid: string; password: string }) => Promise<void> | void)
    | undefined;

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("network");
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [loadingNetworks, setLoadingNetworks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");

  const loadNetworks = React.useCallback(async () => {
    if (Platform.OS !== "android") {
      setWifiNetworks([]);
      return;
    }

    const permission = await requestWifiScanPermission();
    if (permission !== "granted") {
      setWifiNetworks([]);
      setPermissionMessage(
        "Allow nearby WiFi access to see available networks on this device.",
      );
      return;
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
      console.warn("[WIFI_CONFIG_SCREEN] failed to load networks", error);
      setWifiNetworks([]);
      setPermissionMessage(
        "Unable to load WiFi networks right now. You can type the SSID manually.",
      );
      setEntryMode(initialSSID ? "manual" : "network");
    } finally {
      setLoadingNetworks(false);
    }
  }, [initialSSID]);

  useEffect(() => {
    setSsid(initialSSID);
    setPassword(initialPassword);
    setSaving(false);
    setPermissionMessage("");
    setEntryMode(initialSSID ? "manual" : "network");
    void loadNetworks();
  }, [initialPassword, initialSSID, loadNetworks]);

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

  const handleSave = async () => {
    if (!ssid.trim()) {
      Alert.alert("Error", "Please choose a WiFi network or type one manually.");
      return;
    }

    if (!password.trim() || password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }

    if (!onSave) {
      Alert.alert("Error", "Unable to save WiFi configuration right now.");
      return;
    }

    setSaving(true);
    try {
      await onSave({ ssid: ssid.trim(), password });
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
          <ChevronLeft size={20} color="#cbd5e1" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>WiFi Config</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        enableOnAndroid
        extraScrollHeight={28}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Available WiFi</Text>
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
                        entryMode === "manual" && styles.networkNameSelected,
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
                      entryMode === "manual" && styles.networkActionSelected,
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
        </View>
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save Configuration</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingVertical: 6,
    paddingRight: 10,
  },
  backText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 54,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 18,
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  dropdownCard: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
    maxHeight: 220,
  },
  dropdownScroll: {
    maxHeight: 220,
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
    paddingVertical: 10,
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
    fontSize: 13,
    fontWeight: "600",
  },
  networkNameSelected: {
    color: "#bfdbfe",
  },
  networkMeta: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  networkAction: {
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: "700",
  },
  networkActionSelected: {
    color: "#bfdbfe",
  },
  emptyWifiText: {
    color: "#94a3b8",
    fontSize: 12,
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
    fontSize: 11,
    lineHeight: 16,
  },
  helperLink: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  inputGroup: {
    marginTop: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#cbd5e1",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#334155",
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 52,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  saveButton: {
    backgroundColor: "#5b8def",
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#cbd5e1",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
