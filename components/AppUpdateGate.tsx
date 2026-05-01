import { getAppConfig, AppUpdateConfig } from "@/api/appConfig";
import { getAppVersionInfo } from "@/utils/appVersion";
import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

function shouldShowUpdate(update?: AppUpdateConfig | null) {
  return Boolean(update?.required || update?.recommended);
}

export default function AppUpdateGate({ children }: { children: ReactNode }) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [checking, setChecking] = useState(true);
  const [update, setUpdate] = useState<AppUpdateConfig | null>(null);
  const [dismissedNativeBuild, setDismissedNativeBuild] = useState<number | null>(null);

  const checkForUpdate = useCallback(async () => {
    try {
      const versionInfo = getAppVersionInfo();
      const config = await getAppConfig(versionInfo);
      const nextUpdate = config.update ?? null;
      const canRemainDismissed =
        dismissedNativeBuild != null &&
        nextUpdate?.latestNativeBuild === dismissedNativeBuild &&
        !nextUpdate?.required;

      setUpdate(canRemainDismissed ? null : nextUpdate);
    } catch (error) {
      console.warn("App update check failed", error);
    } finally {
      setChecking(false);
    }
  }, [dismissedNativeBuild]);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;

      if (wasInactive && nextState === "active") {
        checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);

  const openStore = useCallback(() => {
    if (update?.storeUrl) {
      Linking.openURL(update.storeUrl).catch((error) => {
        console.warn("Unable to open app store URL", error);
      });
    }
  }, [update?.storeUrl]);

  const dismiss = useCallback(() => {
    if (update?.latestNativeBuild != null) {
      setDismissedNativeBuild(update.latestNativeBuild);
    }
    setUpdate(null);
  }, [update?.latestNativeBuild]);

  const visible = shouldShowUpdate(update);
  const isRequired = Boolean(update?.required || update?.canSkip === false);

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{update?.title || "Update available"}</Text>
            <Text style={styles.message}>
              {update?.message || "A newer version of lOT is available."}
            </Text>
            <Pressable style={styles.primaryButton} onPress={openStore}>
              <Text style={styles.primaryButtonText}>Update</Text>
            </Pressable>
            {!isRequired ? (
              <Pressable style={styles.secondaryButton} onPress={dismiss}>
                <Text style={styles.secondaryButtonText}>Later</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
      {checking ? (
        <View pointerEvents="none" style={styles.checkingOverlay}>
          <ActivityIndicator size="small" color="#93c5fd" />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    borderColor: "rgba(148, 163, 184, 0.22)",
    borderWidth: 1,
    padding: 20,
  },
  title: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  message: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#2563eb",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderRadius: 8,
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#bfdbfe",
    fontSize: 15,
    fontWeight: "600",
  },
  checkingOverlay: {
    position: "absolute",
    right: 16,
    top: 16,
  },
});

