import AsyncStorage from "@react-native-async-storage/async-storage";
import { Device as BleDevice } from "react-native-ble-plx";
import BLEManagerService from "@/services/bleManager";
import { getCanonicalId } from "@/services/bleCanonicalId";

type ResolveBleConnectionArgs = {
  bleManager: BLEManagerService;
  bleId?: string;
  iosBleId?: string;
  macAddress: string;
  activeDevice?: BleDevice | null;
  activeServices?: string[];
  log?: (message: string, payload?: unknown) => void;
};

type ResolveBleConnectionResult = {
  connectedDevice: BleDevice | null;
  serviceIds: string[];
};

export async function resolveBleConnection({
  bleManager,
  bleId,
  iosBleId,
  macAddress,
  activeDevice,
  activeServices = [],
  log,
}: ResolveBleConnectionArgs): Promise<ResolveBleConnectionResult> {
  const logger = log || (() => {});
  let transportId = String(bleId || iosBleId || "").trim();
  let hasTransportCandidate = !!transportId;
  const normalizedMac = String(macAddress || "").trim().toUpperCase();

  const validateTransportForCanonical = async (candidateId: string) => {
    const candidate = String(candidateId || "").trim();
    if (!candidate) return false;
    try {
      const mappedCanonical = await AsyncStorage.getItem(
        `ble:canonical:${candidate}`,
      );
      return String(mappedCanonical || "").trim().toUpperCase() === normalizedMac;
    } catch {
      return false;
    }
  };

  if (!transportId) {
    try {
      const direct = await AsyncStorage.getItem(
        `ble:byCanonical:${normalizedMac}`,
      );
      if (direct && (await validateTransportForCanonical(direct))) {
        transportId = direct;
        hasTransportCandidate = true;
      } else if (direct) {
        logger("Ignoring stale direct canonical->transport mapping", {
          canonical: normalizedMac,
          mappedTransport: direct,
        });
        await AsyncStorage.removeItem(`ble:byCanonical:${normalizedMac}`);
      }

      if (!transportId) {
        const keys = await AsyncStorage.getAllKeys();
        const canonicalKeys = keys.filter((key) =>
          key.startsWith("ble:canonical:"),
        );
        for (const key of canonicalKeys) {
          const value = await AsyncStorage.getItem(key);
          if (String(value || "").trim().toUpperCase() !== normalizedMac) {
            continue;
          }
          const candidate = key.replace("ble:canonical:", "");
          if (candidate && (await validateTransportForCanonical(candidate))) {
            transportId = candidate;
            hasTransportCandidate = true;
            break;
          }
        }
      }
    } catch {}
  }

  if (!transportId) {
    transportId = String(macAddress || "").trim();
    hasTransportCandidate = false;
  }

  const normalizedTargetId = String(transportId || "").trim().toUpperCase();
  logger("Resolved target transport id", { targetId: transportId });

  await bleManager.stopScan();
  const already = await bleManager.getAlreadyConnected();
  logger("Already connected devices", {
    count: already.length,
    ids: already.map((device) => device.id),
  });

  const rawCandidates = [
    String(bleId || "").trim(),
    String(iosBleId || "").trim(),
    String(transportId || "").trim(),
    ...(hasTransportCandidate ? [] : [String(macAddress || "").trim()]),
  ].filter(Boolean);
  const seenNormalized = new Set<string>();
  const candidateIds: string[] = [];
  for (const candidate of rawCandidates) {
    const key = candidate.trim().toUpperCase();
    if (!key || seenNormalized.has(key)) continue;
    seenNormalized.add(key);
    candidateIds.push(candidate);
  }

  let connected: BleDevice | null =
    already.find((device) =>
      candidateIds.some(
        (candidate) =>
          String(device.id || "").toLowerCase() === candidate.toLowerCase(),
      ),
    ) || null;

  if (
    activeDevice &&
    String(activeDevice.id || "").trim().toUpperCase() === normalizedTargetId &&
    activeServices.length > 0
  ) {
    logger("Skipping connect: already active with services", {
      activeDeviceId: activeDevice.id,
      servicesCount: activeServices.length,
    });
    return {
      connectedDevice: activeDevice,
      serviceIds: activeServices,
    };
  }

  if (!connected) {
    for (const candidate of candidateIds) {
      logger("Connecting via connectSafely (direct)", { candidate });
      connected = await bleManager.connectSafely(candidate, {
        retries: 2,
        connectTimeoutMs: 6000,
        autoConnect: false,
        skipScan: true,
        scanTimeoutMs: 2500,
      });
      if (connected) break;
    }
  }

  if (!connected) {
    logger("Trying discovery fallback to resolve live transport id by DIS MAC", {
      canonicalMac: normalizedMac,
    });
    let discoveredTransportId: string | null = null;
    try {
      const { stop, done } = bleManager.startScan_new(
        (device) => {
          void (async () => {
            try {
              const canonical = await getCanonicalId(device, {
                disconnectAfter: false,
              });
              if (String(canonical || "").trim().toUpperCase() === normalizedMac) {
                discoveredTransportId = device.id;
                logger("Discovery fallback matched canonical MAC", {
                  canonical: normalizedMac,
                  transportId: device.id,
                });
                stop();
              }
            } catch {}
          })();
        },
        { stopAfterMs: 5000 },
      );
      await done;
    } catch (error) {
      logger("Discovery fallback scan failed", error);
    }

    if (discoveredTransportId) {
      try {
        await AsyncStorage.setItem(
          `ble:byCanonical:${normalizedMac}`,
          discoveredTransportId,
        );
      } catch {}
      try {
        await bleManager.stopScan();
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 180));
      logger("Connecting using discovery-resolved transport", {
        discoveredTransportId,
      });
      connected = await bleManager.connectSafely(discoveredTransportId, {
        retries: 2,
        connectTimeoutMs: 7000,
        autoConnect: false,
        skipScan: true,
        scanTimeoutMs: 8000,
      });
    }
  }

  if (!connected) {
    for (const candidate of candidateIds) {
      logger("Retrying connect via scan-assisted connectSafely", { candidate });
      connected = await bleManager.connectSafely(candidate, {
        retries: 1,
        connectTimeoutMs: 5000,
        autoConnect: false,
        skipScan: false,
        scanTimeoutMs: 4500,
      });
      if (connected) break;
    }
  }

  if (!connected) {
    logger("Failed to connect: connected device is null");
    return {
      connectedDevice: null,
      serviceIds: [],
    };
  }

  logger("Connected to BLE device", { connectedId: connected.id });
  try {
    await connected.discoverAllServicesAndCharacteristics();
  } catch (error) {
    logger("Service discovery failed on first attempt", error);
  }

  let serviceIds = await bleManager.getCustomServiceId(connected);
  if (!serviceIds.length) {
    logger("No custom services found; retrying discovery once");
    try {
      await connected.discoverAllServicesAndCharacteristics();
      serviceIds = await bleManager.getCustomServiceId(connected);
    } catch (error) {
      logger("Service discovery retry failed", error);
    }
  }

  logger("Resolved custom services", {
    connectedId: connected.id,
    serviceIds,
  });

  return {
    connectedDevice: connected,
    serviceIds,
  };
}
