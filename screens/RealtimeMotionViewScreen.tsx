import RealtimeMotionGraph, {
  RealtimeMotionDot,
} from "@/components/realtime/RealtimeMotionGraph";
import RealtimeMotionLegend from "@/components/realtime/RealtimeMotionLegend";
import { RootStackParamList } from "@/constants/types";
import { DATA_CHAR_UUID } from "@/constants";
import BLEManagerService from "@/services/bleManager";
import { resolveBleConnection } from "@/services/bleConnection";
import { RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Buffer } from "buffer";
import React from "react";
import {
  Alert,
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Device as BleDevice } from "react-native-ble-plx";

type Props = {
  route: RouteProp<RootStackParamList, "RealtimeMotionView">;
  navigation: NativeStackNavigationProp<RootStackParamList, "RealtimeMotionView">;
};

type Disposable = {
  remove?: () => void;
  unsubscribe?: () => void;
};

type RealtimeSnapshot = {
  sensorMac: string;
  coverageRangeCm: number;
  seqNo: number;
  detected: boolean;
  dots: RealtimeMotionDot[];
  capturedAt: number;
};

type RealtimeFrame = {
  sensorMac: string;
  coverageRangeCm: number;
  seqNo: number;
  gates: number[];
  capturedAt: number;
};

const BLE_COMMAND_TIMEOUT_MS = 6000;
const MAX_GRAPH_RANGE_CM = 700;
const MAX_GATE_COUNT = 16;
const BASE_DELTA_THRESHOLD = 120;
const NEAR_FIELD_DELTA_THRESHOLD = 280;
const GATE_ZERO_DELTA_THRESHOLD = 1200;
const MAX_DELTA_SCORE = 2500;
const BASELINE_WARMUP_FRAMES = 3;

const parseRealtimeFrame = (raw: string): RealtimeFrame | null => {
  if (!raw.startsWith("REALTIME_MOTION_RAW:")) return null;
  const payload = raw.replace("REALTIME_MOTION_RAW:", "").trim();
  const [
    sensorMac,
    coverageRangeCm,
    seqNo,
    timestampMs,
    gateCountToken = "0",
    gatesToken = "",
  ] =
    payload.split("|");
  if (!sensorMac) return null;

  const normalizedRange = Math.max(
    30,
    Math.min(MAX_GRAPH_RANGE_CM, Number(coverageRangeCm) || MAX_GRAPH_RANGE_CM),
  );
  const safeGateCount = Math.max(
    0,
    Math.min(MAX_GATE_COUNT, Number(gateCountToken) || 0),
  );
  const gates = gatesToken
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((energy) => Number.isFinite(energy))
    .slice(0, safeGateCount);

  return {
    sensorMac: sensorMac.trim().toUpperCase(),
    coverageRangeCm: normalizedRange,
    seqNo: Number(seqNo) || 0,
    gates,
    capturedAt: Number(timestampMs) || Date.now(),
  };
};

const computeRealtimeDots = ({
  frame,
  baseline,
  warmupFrames,
}: {
  frame: RealtimeFrame;
  baseline: number[];
  warmupFrames: number;
}): RealtimeMotionDot[] => {
  if (!frame.gates.length) return [];
  if (warmupFrames < BASELINE_WARMUP_FRAMES) return [];

  const candidates: Array<RealtimeMotionDot & { motionDelta: number }> = [];

  for (let index = 0; index < frame.gates.length; index += 1) {
    const rawEnergy = frame.gates[index] || 0;
    const baselineEnergy = baseline[index] || 0;
    const motionDelta = Math.max(0, rawEnergy - baselineEnergy);
    const distanceCm = Math.round(
      ((index + 1) * MAX_GRAPH_RANGE_CM) / frame.gates.length,
    );
    if (distanceCm > frame.coverageRangeCm) {
      continue;
    }

    const deltaThreshold =
      distanceCm <= 140 ? NEAR_FIELD_DELTA_THRESHOLD : BASE_DELTA_THRESHOLD;
    if (motionDelta < deltaThreshold) {
      continue;
    }

    const prevDelta =
      index === 0
        ? 0
        : Math.max(0, (frame.gates[index - 1] || 0) - (baseline[index - 1] || 0));
    const nextDelta =
      index + 1 >= frame.gates.length
        ? 0
        : Math.max(0, (frame.gates[index + 1] || 0) - (baseline[index + 1] || 0));

    if (motionDelta < prevDelta || motionDelta < nextDelta) {
      continue;
    }

    // Gate 0 is the noisiest near-field zone on this sensor, so only show it
    // when it has a strong change and the next gate also confirms activity.
    if (index === 0) {
      if (
        motionDelta < GATE_ZERO_DELTA_THRESHOLD ||
        nextDelta < BASE_DELTA_THRESHOLD
      ) {
        continue;
      }
    }

    const score = Math.min(
      100,
      Math.round((motionDelta / MAX_DELTA_SCORE) * 100),
    );
    if (score <= 0) continue;

    candidates.push({
      distanceCm,
      score,
      motionDelta,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.motionDelta - a.motionDelta;
  });

  return candidates.slice(0, 3).map(({ distanceCm, score }) => ({
    distanceCm,
    score,
  }));
};

const updateBaseline = ({
  frame,
  baseline,
}: {
  frame: RealtimeFrame;
  baseline: number[];
}): number[] => {
  const nextBaseline = [...baseline];

  for (let index = 0; index < frame.gates.length; index += 1) {
    const rawEnergy = frame.gates[index] || 0;
    const currentBaseline = nextBaseline[index] || 0;

    if (currentBaseline <= 0) {
      nextBaseline[index] = rawEnergy;
      continue;
    }

    const motionDelta = Math.max(0, rawEnergy - currentBaseline);
    const adaptRate = motionDelta < BASE_DELTA_THRESHOLD ? 0.18 : 0.03;
    nextBaseline[index] = Math.round(
      currentBaseline * (1 - adaptRate) + rawEnergy * adaptRate,
    );
  }

  return nextBaseline;
};

const formatUpdatedAt = (timestamp: number) => {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function RealtimeMotionViewScreen({
  route,
  navigation,
}: Props) {
  const {
    switchboardName,
    deviceId,
    iosBleId,
    bleId,
    sensorMac,
    coverageRangeCm,
  } = route.params;

  const bleManagerRef = React.useRef<BLEManagerService>(null);
  if (!bleManagerRef.current) {
    bleManagerRef.current = new BLEManagerService();
  }
  const bleManager = bleManagerRef.current;
  const [activeDevice, setActiveDevice] = React.useState<BleDevice | null>(null);
  const [services, setServices] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [starting, setStarting] = React.useState(false);
  const [sessionActive, setSessionActive] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<RealtimeSnapshot>({
    sensorMac,
    coverageRangeCm,
    seqNo: 0,
    detected: false,
    dots: [],
    capturedAt: 0,
  });

  const monitorRef = React.useRef<Disposable | null>(null);
  const disconnectRef = React.useRef<Disposable | null>(null);
  const commandWaiterRef = React.useRef<
    ((value: { ok: boolean; message?: string }) => void) | null
  >(null);
  const closingRef = React.useRef(false);
  const screenActiveRef = React.useRef(false);
  const reconnectTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptsRef = React.useRef(0);
  const startRealtimeSessionRef = React.useRef<() => Promise<void>>(
    async () => {},
  );
  const baselineRef = React.useRef<number[]>([]);
  const baselineWarmupFramesRef = React.useRef(0);
  const lastPacketLogRef = React.useRef<{
    seqNo: number;
    receivedAtMs: number;
    sensorTimestampMs: number;
  } | null>(null);

  const bleLog = React.useCallback(
    (message: string, payload?: unknown) => {
      if (payload === undefined) {
        console.log(`[RealtimeMotion][${sensorMac}] ${message}`);
      } else {
        console.log(`[RealtimeMotion][${sensorMac}] ${message}`, payload);
      }
    },
    [sensorMac],
  );

  const teardownMonitor = React.useCallback(() => {
    monitorRef.current?.remove?.();
    monitorRef.current?.unsubscribe?.();
    monitorRef.current = null;
  }, []);

  const clearReconnectTimer = React.useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const stopRealtimeSession = React.useCallback(
    async (options?: { silent?: boolean; navigateBack?: boolean }) => {
      if (closingRef.current) return;
      closingRef.current = true;
      try {
        if (activeDevice && services[0]) {
          await bleManager.sendData(
            activeDevice,
            `SENSOR_RT_VIEW_STOP:${sensorMac}`,
            services[0],
          );
        }
      } catch (error) {
        bleLog("Failed to stop realtime session", error);
      } finally {
        setSessionActive(false);
        closingRef.current = false;
        if (options?.navigateBack && navigation.canGoBack()) {
          navigation.goBack();
        }
        if (!options?.silent) {
          bleLog("Realtime session closed");
        }
      }
    },
    [activeDevice, bleManager, bleLog, navigation, sensorMac, services],
  );

  const waitForCommandResult = React.useCallback(() => {
    return new Promise<{ ok: boolean; message?: string }>((resolve) => {
      commandWaiterRef.current = resolve;
      setTimeout(() => {
        if (commandWaiterRef.current !== resolve) return;
        commandWaiterRef.current = null;
        resolve({ ok: false, message: "Hub did not confirm realtime mode." });
      }, BLE_COMMAND_TIMEOUT_MS);
    });
  }, []);

  const ensureConnection = React.useCallback(async () => {
    const { connectedDevice, serviceIds } = await resolveBleConnection({
      bleManager,
      bleId,
      iosBleId,
      macAddress: deviceId,
      activeDevice,
      activeServices: services,
      log: bleLog,
    });
    if (!connectedDevice || !serviceIds.length) {
      throw new Error("Hub BLE is unavailable.");
    }
    setActiveDevice(connectedDevice);
    setServices(serviceIds);
    return {
      connectedDevice,
      serviceId: serviceIds[0],
    };
  }, [activeDevice, bleId, bleLog, bleManager, deviceId, iosBleId, services]);

  const handleTransientDisconnect = React.useCallback(
    (reason: string) => {
      if (closingRef.current || !screenActiveRef.current) {
        return;
      }
      clearReconnectTimer();
      teardownMonitor();
      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
      disconnectRef.current = null;
      setSessionActive(false);
      setActiveDevice(null);
      setServices([]);
      setLoading(true);

      if (reconnectAttemptsRef.current >= 3) {
        setLoading(false);
        bleLog("Realtime reconnect limit reached", { reason });
        return;
      }

      reconnectAttemptsRef.current += 1;
      bleLog("Realtime session dropped; reconnecting", {
        reason,
        attempt: reconnectAttemptsRef.current,
      });

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!screenActiveRef.current || closingRef.current) return;
        void startRealtimeSessionRef.current().catch((error: any) => {
          bleLog("Realtime reconnect failed", error?.message || error);
          if (!screenActiveRef.current || closingRef.current) {
            return;
          }
          if (reconnectAttemptsRef.current >= 3) {
            setLoading(false);
            bleLog("Realtime reconnect limit reached", {
              reason: "retry_failed",
            });
            return;
          }
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!screenActiveRef.current || closingRef.current) return;
            void startRealtimeSessionRef.current().catch((retryError: any) => {
              bleLog(
                "Realtime reconnect failed",
                retryError?.message || retryError,
              );
            });
          }, 900);
        });
      }, 900);
    },
    [bleLog, clearReconnectTimer, teardownMonitor],
  );

  const startRealtimeSession = React.useCallback(async () => {
    setStarting(true);
    try {
      const { connectedDevice, serviceId } = await ensureConnection();
      const onReceive = (data: string) => {
        const messages = String(data || "")
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean);

        messages.forEach((message) => {
          if (message.startsWith("SENSOR_RT_VIEW_")) {
            if (message.startsWith("SENSOR_RT_VIEW_OK")) {
              commandWaiterRef.current?.({ ok: true });
            } else if (message.startsWith("SENSOR_RT_VIEW_FAIL:")) {
              commandWaiterRef.current?.({
                ok: false,
                message:
                  message.replace("SENSOR_RT_VIEW_FAIL:", "").trim() ||
                  "Unable to start realtime mode.",
              });
            }
            commandWaiterRef.current = null;
            return;
          }

          const nextFrame = parseRealtimeFrame(message);
          if (!nextFrame) return;
          if (nextFrame.sensorMac !== String(sensorMac).trim().toUpperCase()) {
            return;
          }

          const receivedAtMs = Date.now();
          const previousPacket = lastPacketLogRef.current;
          bleLog("Realtime motion packet", {
            seqNo: nextFrame.seqNo,
            gateCount: nextFrame.gates.length,
            sensorTimestampMs: nextFrame.capturedAt,
            receivedAtMs,
            appGapMs: previousPacket
              ? receivedAtMs - previousPacket.receivedAtMs
              : null,
            sensorGapMs: previousPacket
              ? nextFrame.capturedAt - previousPacket.sensorTimestampMs
              : null,
          });
          lastPacketLogRef.current = {
            seqNo: nextFrame.seqNo,
            receivedAtMs,
            sensorTimestampMs: nextFrame.capturedAt,
          };

          if (!baselineRef.current.length) {
            baselineRef.current = [...nextFrame.gates];
            baselineWarmupFramesRef.current = 1;
          } else {
            baselineWarmupFramesRef.current += 1;
          }

          const dots = computeRealtimeDots({
            frame: nextFrame,
            baseline: baselineRef.current,
            warmupFrames: baselineWarmupFramesRef.current,
          });

          baselineRef.current = updateBaseline({
            frame: nextFrame,
            baseline: baselineRef.current,
          });

          setSnapshot({
            sensorMac: nextFrame.sensorMac,
            coverageRangeCm: nextFrame.coverageRangeCm,
            seqNo: nextFrame.seqNo,
            detected: dots.length > 0,
            dots,
            capturedAt: nextFrame.capturedAt,
          });
        });
      };

      teardownMonitor();
      monitorRef.current = bleManager.subscribeToData(
        connectedDevice,
        serviceId,
        onReceive,
        async () => {
          handleTransientDisconnect("monitor_error");
        },
      ) as Disposable;

      disconnectRef.current?.remove?.();
      disconnectRef.current?.unsubscribe?.();
      disconnectRef.current =
        (bleManager.onDeviceDisconnected?.(connectedDevice.id, async () => {
          handleTransientDisconnect("ble_disconnect");
        }) as Disposable | undefined) || null;

      const pending = waitForCommandResult();
      await bleManager.safeWrite({
        device: connectedDevice,
        serviceUUID: serviceId,
        charUUID: DATA_CHAR_UUID,
        base64Payload: Buffer.from(
          `SENSOR_RT_VIEW_START:${sensorMac}`,
          "utf8",
        ).toString("base64"),
      });
      const result = await pending;
      if (!result.ok) {
        throw new Error(result.message || "Realtime mode start failed.");
      }
      reconnectAttemptsRef.current = 0;
      baselineRef.current = [];
      baselineWarmupFramesRef.current = 0;
      lastPacketLogRef.current = null;
      setSessionActive(true);
    } finally {
      setLoading(false);
      setStarting(false);
    }
  }, [
    bleManager,
    ensureConnection,
    handleTransientDisconnect,
    sensorMac,
    teardownMonitor,
    waitForCommandResult,
  ]);

  React.useEffect(() => {
    startRealtimeSessionRef.current = startRealtimeSession;
  }, [startRealtimeSession]);

  useFocusEffect(
    React.useCallback(() => {
      screenActiveRef.current = true;
      void startRealtimeSession().catch((error: any) => {
        setLoading(false);
        Alert.alert(
          "Realtime View",
          error?.message || "Unable to open realtime motion view.",
          [
            {
              text: "OK",
              onPress: () => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                }
              },
            },
          ],
        );
      });

      const sub = AppState.addEventListener("change", (state) => {
        if (state === "background" || state === "inactive") {
          void stopRealtimeSession({ silent: true });
        }
      });

      return () => {
        screenActiveRef.current = false;
        sub.remove();
        clearReconnectTimer();
        teardownMonitor();
        disconnectRef.current?.remove?.();
        disconnectRef.current?.unsubscribe?.();
        disconnectRef.current = null;
        void stopRealtimeSession({ silent: true });
      };
    }, [
      clearReconnectTimer,
      navigation,
      startRealtimeSession,
      stopRealtimeSession,
      teardownMonitor,
    ]),
  );
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => stopRealtimeSession({ navigateBack: true })}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>Realtime Motion Range View</Text>
            <Text style={styles.title}>{switchboardName}</Text>
            <Text style={styles.subtitle}>{sensorMac}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <RealtimeMotionLegend
            sessionActive={sessionActive}
            coverageRangeCm={snapshot.coverageRangeCm}
            lastUpdatedAt={formatUpdatedAt(snapshot.capturedAt)}
          />
          <RealtimeMotionGraph
            coverageRangeCm={snapshot.coverageRangeCm}
            dots={snapshot.dots}
            loading={loading || starting}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
  },
  backButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
  },
  headerTextWrap: {
    flex: 1,
  },
  eyebrow: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 18,
  },
});
