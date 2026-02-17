import { sleep } from "@/utils/general";
import { getESPServiceIds } from "@/utils/storage";
import {
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  Platform,
} from "react-native";
import {
  BleManager,
  Characteristic,
  ConnectionPriority,
  Device,
  ScanCallbackType,
  ScanMode,
  State,
  Subscription,
} from "react-native-ble-plx";
import { DATA_CHAR_UUID, ESP_SERVICE_UUID as DEFAULT_ESP_SERVICE_UUID, STANDARD_SERVICE_UUIDS } from "../constants";
import { getScanId } from "./bleIds";

const Buffer = require("buffer").Buffer;
export const sharedBleManager = new BleManager();

type ConnectOpts = {
  serviceUUIDs?: string[]; // for scan filtering (better than id on iOS)
  connectTimeoutMs?: number; // per-attempt
  scanTimeoutMs?: number; // pre-scan budget
  retries?: number; // retry count on transient errors (e.g., 133)
  autoConnect?: boolean; // default false; true only if you know why
  refreshGatt?: "OnConnected" | "Never";
  skipScan?: boolean;
};
export type Disposer = { remove: () => void };
type StartOpts = { stopAfterMs?: number };
type StartScanHandle = { stop: () => void; done: Promise<void> };

class BLEManagerService {
  private connectedDeviceIds = new Set<string>();
  private manager = sharedBleManager;
  private isScanning = false;
  private appState: AppStateStatus = AppState.currentState;
  private appStateSub?: { remove: () => void };
  public ESP_SERVICE_UUID: string[] = [];

  private session = 0;
  private currentStop: (() => void) | null = null;
  private currentDoneResolve: (() => void) | null = null;
  private seen = new Set<string>();
  private last = new Map<string, { ts: number; rssi: number | null }>();

  constructor() {
    this.appStateSub = AppState.addEventListener(
      "change",
      this.handleAppStateChange,
    );
    this.mapServiceIds();
  }

  private normalizeServiceIds(ids: string[]): string[] {
    return Array.from(
      new Set(
        (ids || [])
          .map((id) => String(id || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  mapServiceIds = async () => {
    const cached = this.normalizeServiceIds(await getESPServiceIds());
    this.ESP_SERVICE_UUID =
      cached.length > 0
        ? cached
        : this.normalizeServiceIds(DEFAULT_ESP_SERVICE_UUID);
  };

  private handleAppStateChange = (nextState: AppStateStatus) => {
    this.appState = nextState;
  };

  async ensureRestartableCoolDown(ms = 150) {
    // brief cool-down to avoid "Cannot start scanning operation"
    await new Promise((r) => setTimeout(r, ms));
  }

  /** Call once at app startup (or before scanning) */
  async initialize() {
    if (Platform.OS !== "android") return true;

    if (Platform.Version >= 31) {
      const scan = await PermissionsAndroid.request(
        "android.permission.BLUETOOTH_SCAN",
        {
          title: "Bluetooth permission",
          message: "Needed to scan for devices",
          buttonPositive: "OK",
        },
      );
      const connect = await PermissionsAndroid.request(
        "android.permission.BLUETOOTH_CONNECT",
        {
          title: "Bluetooth permission",
          message: "Needed to connect to devices",
          buttonPositive: "OK",
        },
      );
      return (
        scan === PermissionsAndroid.RESULTS.GRANTED &&
        connect === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const loc = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return loc === PermissionsAndroid.RESULTS.GRANTED;
    }
  }

  /**
   * Resolves once CBCentralManager reports that Bluetooth is PoweredOn on iOS.
   * (On Android it resolves immediately.)
   */
  async waitForPoweredOn(timeoutMs = 10000): Promise<void> {
    const s = await this.manager.state();
    if (s === State.PoweredOn) return;

    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(() => {
        sub.remove();
        reject(new Error("Bluetooth not PoweredOn"));
      }, timeoutMs);

      const sub = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(tid);
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  async startScan(
    onDeviceFound: (device: Device) => void,
    opts?: { stopAfterMs?: number; rssiDelta?: number; minIntervalMs?: number },
  ) {
    if (this.isScanning) {
      // stop previous scan before starting a new one
      try {
        this.manager.stopDeviceScan();
      } catch {}
      this.isScanning = false;
      await new Promise((r) => setTimeout(r, 200)); // small cool-down
    }

    await this.initialize();
    await this.waitForPoweredOn();

    const stopAfterMs = opts?.stopAfterMs ?? 15000;
    const rssiDelta = opts?.rssiDelta ?? 8; // dBm change threshold
    const minIntervalMs = opts?.minIntervalMs ?? 5000; // throttle same id

    this.isScanning = true;
    this.seen.clear();
    this.last.clear();

    const scanFilter =
      this.ESP_SERVICE_UUID && this.ESP_SERVICE_UUID.length
        ? this.ESP_SERVICE_UUID
        : null;
    this.manager.startDeviceScan(
      scanFilter as any,
      Platform.select({
        ios: { allowDuplicates: false },
        android: {
          allowDuplicates: false,
          scanMode: ScanMode.LowLatency,
          callbackType: ScanCallbackType.AllMatches,
        },
      }) as any,
      async (error, device) => {
        if (error) {
          return;
        }
        if (!device) return;
        const scanId = getScanId(device);
        if (!scanId) return;

        const now = Date.now();
        const rssi = device.rssi ?? null;

        if (!this.seen.has(scanId)) {
          this.seen.add(scanId);
          this.last.set(scanId, { ts: now, rssi });
          onDeviceFound(device);
          return;
        }
      },
    );
    if (stopAfterMs > 0) {
      setTimeout(() => this.stopScan(), stopAfterMs);
    }
  }

  startScan_new(
    onDeviceFound: (device: Device) => void,
    opts: StartOpts & { serviceUUIDs?: string[] | null } = {},
  ): StartScanHandle {
    // sharedBleManager is process-wide; always hard-stop any prior scan first.
    try {
      this.manager.stopDeviceScan();
    } catch {}
    if (this.isScanning) {
      try {
        this.stopScan();
      } catch {}
    }

    const mySession = ++this.session;
    this.isScanning = true;
    this.seen.clear();

    // Promise that resolves when this scan ends
    const done = new Promise<void>((resolve) => {
      this.currentDoneResolve = () => {
        if (this.session === mySession) resolve();
      };
    });

    const stop = () => {
      if (this.session !== mySession) return; // only stop if this session is current
      try {
        this.manager.stopDeviceScan();
      } catch {}
      this.isScanning = false;
      this.currentStop = null;
      this.currentDoneResolve?.();
      this.currentDoneResolve = null;
    };
    this.currentStop = stop;

    (async () => {
      try {
        await this.initialize();
        await this.waitForPoweredOn();
        await this.ensureRestartableCoolDown(120); // tiny delay helps some Android stacks
      } catch (e) {
        stop();
        return;
      }

      const serviceUUIDs =
        typeof opts.serviceUUIDs === "undefined"
          ? this.ESP_SERVICE_UUID
          : opts.serviceUUIDs;
      const scanFilter =
        serviceUUIDs && serviceUUIDs.length ? serviceUUIDs : null;

      this.manager.startDeviceScan(
        scanFilter as any,
        Platform.select({
          ios: { allowDuplicates: false } as any,
          android: {
            allowDuplicates: false,
            scanMode: ScanMode.LowLatency,
            callbackType: ScanCallbackType.AllMatches,
          } as any,
        }) as any,
        (error, device) => {
          // ignore callbacks from stale sessions
          if (this.session !== mySession) return;

          if (error) {
            stop();
            return;
          }
          if (!device) return;

          // de-dupe per scan
          const key = device.id; // or your getScanId()
          if (this.seen.has(key)) return;
          this.seen.add(key);

          // important: do NOT stop/restart from inside this callback
          onDeviceFound(device);
        },
      );

      const stopAfterMs = opts.stopAfterMs ?? 15000;
      if (stopAfterMs > 0) setTimeout(stop, stopAfterMs);
    })();

    return { stop, done };
  }

  /**
   * Start scanning for ESP devices.
   * onDeviceFound is called for each discovered device.
   */
  // async startScan(onDeviceFound: (device: Device) => void) {
  //   if (this.isScanning) return;

  //   await this.initialize();

  //   await this.waitForPoweredOn();

  //   this.isScanning = true;

  //   this.manager.startDeviceScan(ESP_SERVICE_UUID, Platform.select({
  //   ios: { allowDuplicates: false }, // iOS-only
  //   android: {
  //     // Android controls are these, not `allowDuplicates`
  //     allowDuplicates: false,
  //     scanMode: ScanMode.LowLatency,
  //     callbackType: ScanCallbackType.AllMatches, // default, but set explicitly
  //     // legacyScan: true, // (default) keep unless you know you need otherwise
  //   },
  // }) as any, (error, device) => {
  //     if (error) {
  //       return;
  //     }

  //     if (device) {
  //       onDeviceFound(device);
  //     }
  //   });
  // }

  /** Stop an ongoing scan */
  stopScan() {
    if (!this.isScanning) return;
    this.manager.stopDeviceScan();
    this.isScanning = false;
    this.seen.clear();
    this.last.clear();
  }

  /** Connect to a device (with automatic service discovery) */
  async connect(device: Device): Promise<Device> {
    const connected = await device.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.connectedDeviceIds.add(connected.id);

    return connected;
  }

  /**
   * Send an arbitrary UTF-8 string to the device.
   * Resolves once the write is acknowledged.
   */
  async sendData(
    device: Device,
    data: string,
    serviceUUID: string,
  ): Promise<void> {
    try {
      const base64 = Buffer.from(data, "utf8").toString("base64");
      const res = await device.writeCharacteristicWithResponseForService(
        serviceUUID,
        DATA_CHAR_UUID,
        base64,
      );
    } catch (err) {}
  }

  /**
   * Subscribe to incoming data notifications.
   * Returns a subscription you can call .remove() on when you're done.
   */
  subscribeToData(
    device: Device,
    serviceUUID: string,
    onReceive: (data: string) => void,
    onError?: (error: Error) => void,
  ) {
    return device.monitorCharacteristicForService(
      serviceUUID,
      DATA_CHAR_UUID,
      (error, char: Characteristic | null) => {
        if (error) {
          onError?.(error);
          return;
        }

        if (char?.value) {
          // decode Base64 → UTF8 string
          const received = Buffer.from(char.value, "base64").toString("utf8");
          onReceive(received);
        }
      },
    );
  }

  async safeWrite({
    device,
    serviceUUID,
    charUUID = DATA_CHAR_UUID,
    base64Payload,
  }: {
    device: Device;
    serviceUUID: string;
    charUUID: string;
    base64Payload: string; // e.g., btoa("REST:")
  }) {
    // 1) Ensure connected
    const connected = await device.isConnected();
    if (!connected) await device.connect();

    // 2) Discover services/chars before any write
    await device.discoverAllServicesAndCharacteristics();

    // 3) (Android) Negotiate a reasonable MTU if you might send > 20 bytes
    if (Platform.OS === "android") {
      try {
        await device.requestMTU(185);
      } catch {}
    }

    // 4) Confirm the characteristic is writable the way you intend
    const chars = await device.characteristicsForService(serviceUUID);
    const target = chars.find(
      (c) => c.uuid.toLowerCase() === charUUID.toLowerCase(),
    );
    if (!target) throw new Error("Characteristic not found");

    if (target.isWritableWithResponse) {
      return device.writeCharacteristicWithResponseForService(
        serviceUUID,
        charUUID,
        base64Payload,
      );
    } else if (target.isWritableWithoutResponse) {
      return device.writeCharacteristicWithoutResponseForService(
        serviceUUID,
        charUUID,
        base64Payload,
      );
    } else {
      throw new Error("Characteristic not writable");
    }
  }

  async connectedDevices() {
    const filter =
      this.ESP_SERVICE_UUID && this.ESP_SERVICE_UUID.length
        ? this.ESP_SERVICE_UUID
        : [];
    const connected: Device[] = await this.manager.connectedDevices(filter);
    return connected;
  }

  /** Disconnect & destroy the manager (call on app exit) */
  async destroy() {
    try {
      this.appStateSub?.remove();

      // cancel all connections
      for (let id of this.connectedDeviceIds) {
        this.manager.cancelDeviceConnection(id).catch(() => {});
      }
      this.connectedDeviceIds.clear();

      this.stopScan();
      this.manager.destroy();
    } catch (e) {}
  }

  onDeviceDisconnected(
    deviceId: string,
    cb: (info: { error: Error | null; device: Device | null }) => void,
  ): Disposer {
    const sub: Subscription = this.manager.onDeviceDisconnected(
      deviceId,
      (error, device) => {
        cb({ error: error ?? null, device: device ?? null });
      },
    );
    return { remove: () => sub.remove() };
  }

  /**
   * Retrieve any devices already connected to our ESP service.
   * On iOS this returns all OS‐level connected periphs matching the UUID.
   * On Android it may be empty if none are connected right now.
   */
  async getAlreadyConnected(): Promise<Device[]> {
    const filter =
      this.ESP_SERVICE_UUID && this.ESP_SERVICE_UUID.length
        ? this.ESP_SERVICE_UUID
        : [];
    return await this.manager.connectedDevices(filter);
  }

  async connectToDevice(deviceId: string) {
    try {
      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: true,
        timeout: 5000,
      });

      return device;
    } catch (err) {
      return null;
    }
  }

  private async resetManager(deviceId: string) {
    try {
      this.manager.stopDeviceScan();
      await new Promise((res) => setTimeout(res, 100));
      await this.manager.cancelDeviceConnection(deviceId).catch((err) => {});

      await new Promise((res) => setTimeout(res, 200));
    } catch (err) {}
  }

  async connectAndDiscover(deviceId: string) {
    try {
      await this.resetManager(deviceId);

      await this.initialize();
      await this.waitForPoweredOn();

      try {
        const device = await this.manager.connectToDevice(deviceId, {
          autoConnect: true,
          timeout: 5000,
          refreshGatt: "OnConnected",
        });
        const discoveredDevice =
          await device.discoverAllServicesAndCharacteristics();

        this.connectedDeviceIds.add(deviceId);

        const services = await discoveredDevice.services();

        for (let service of services) {
          const characteristics = await service.characteristics();
          for (let char of characteristics) {
          }
        }

        // remove from set when it disconnects
        discoveredDevice.onDisconnected(() =>
          this.connectedDeviceIds.delete(deviceId),
        );
        return discoveredDevice;
      } catch (err: any) {}
    } catch (err) {
      throw err;
    }
  }

  getCustomServiceId = async (device: Device) => {
    const services = await device.services();
    const customServices = services.filter(
      (service) => !STANDARD_SERVICE_UUIDS.includes(service.uuid.toLowerCase()),
    );

    return customServices.map((service) => service.uuid);
  };

  cancelDeviceConnection = async (device: Device) => {
    try {
      await this.manager.cancelDeviceConnection(device.id);
    } catch (e) {}
  };

  cancelById = async (deviceId: string) => {
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } catch {}
  };

  async connectSafely(
    deviceId: string,
    {
      connectTimeoutMs = 6000,
      scanTimeoutMs = 4000,
      retries = 1,
      autoConnect = false,
      refreshGatt = Platform.OS === "android" ? "OnConnected" : "Never",
      skipScan = false,
    }: ConnectOpts = {},
  ): Promise<Device | null> {
    const state = await this.manager.state();
    if (state !== "PoweredOn") {
      return null;
    }

    if (!skipScan && scanTimeoutMs > 0) {
      const seen = await this.scanForPresence(this.manager, {
        deviceId,
        serviceUUIDs: this.ESP_SERVICE_UUID,
        timeoutMs: scanTimeoutMs,
      });
      if (!seen) return null;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const device = await this.manager.connectToDevice(
          deviceId.toUpperCase(),
          {
            autoConnect: false,
            timeout: undefined,
          },
        );
        if (Platform.OS === "android") {
          await sleep(300);
        }

        await device.discoverAllServicesAndCharacteristics();

        if (Platform.OS === "android") {
          try {
            await device.requestMTU(185);
          } catch {}
          try {
            await device.requestConnectionPriority(ConnectionPriority.High);
          } catch {}
        }

        return device;
      } catch (err: any) {
        if (err?.message?.includes("already connected")) {
          const devices = await this.manager.connectedDevices([]);
          const match = devices.find((d) => d.id === deviceId);
          return match || devices[0] || null;
        }
        try {
          await this.manager.cancelDeviceConnection(deviceId);
        } catch {}
        await sleep(1500);
      }
    }
    return null;
  }

  async scanForPresence(
    manager: BleManager,
    {
      deviceId,
      serviceUUIDs,
      timeoutMs,
    }: { deviceId: string; serviceUUIDs?: string[]; timeoutMs: number },
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const stop = () => {
        if (!done) {
          done = true;
          manager.stopDeviceScan();
        }
      };

      manager.startDeviceScan(
        serviceUUIDs ?? null,
        { allowDuplicates: false },
        (_err, dev) => {
          if (done) return;
          // On Android, dev.id is the MAC; on iOS it's a UUID—service filter helps.
          if (dev) {
            const devId = dev.id?.toLowerCase?.() ?? "";
            const targetId = (deviceId || "").toLowerCase();
            if (!deviceId || devId === targetId) {
              stop();
              resolve(true);
            }
          }
        },
      );

      setTimeout(() => {
        stop();
        resolve(false);
      }, timeoutMs);
    });
  }
}

export default BLEManagerService;
