import { sleep } from '@/utils/general';
import { getESPServiceIds } from '@/utils/storage';
import { AppState, AppStateStatus, PermissionsAndroid, Platform } from 'react-native';
import {
  BleManager,
  Characteristic,
  ConnectionPriority,
  Device,
  ScanCallbackType,
  ScanMode,
  State,
  Subscription
} from 'react-native-ble-plx';
import { DATA_CHAR_UUID, STANDARD_SERVICE_UUIDS } from '../constants';
import { getScanId } from './bleIds';


const Buffer = require('buffer').Buffer;

type ConnectOpts = {
  serviceUUIDs?: string[]; // for scan filtering (better than id on iOS)
  connectTimeoutMs?: number; // per-attempt
  scanTimeoutMs?: number;    // pre-scan budget
  retries?: number;          // retry count on transient errors (e.g., 133)
  autoConnect?: boolean;     // default false; true only if you know why
  refreshGatt?: "OnConnected" | "Never";
};
export type Disposer = { remove: () => void };
type StartOpts = { stopAfterMs?: number };
type StartScanHandle = { stop: () => void; done: Promise<void> };

class BLEManagerService {
  private connectedDeviceIds = new Set<string>();
  private manager = new BleManager();
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
      this.handleAppStateChange
    );
    this.mapServiceIds();
  }

  mapServiceIds = async () => {
    this.ESP_SERVICE_UUID = await getESPServiceIds();
  };

  private handleAppStateChange = (nextState: AppStateStatus) => {
    console.log("App got in background");
    this.appState = nextState;
  };

  async ensureRestartableCoolDown(ms = 150) {
    // brief cool-down to avoid "Cannot start scanning operation"
    await new Promise(r => setTimeout(r, ms));
  }

  /** Call once at app startup (or before scanning) */
  async initialize() {
    if (Platform.OS !== 'android') return true;

    if (Platform.Version >= 31) {
      const scan = await PermissionsAndroid.request(
        'android.permission.BLUETOOTH_SCAN',
        { title: 'Bluetooth permission', message: 'Needed to scan for devices', buttonPositive: 'OK' }
      );
      const connect = await PermissionsAndroid.request(
        'android.permission.BLUETOOTH_CONNECT',
        { title: 'Bluetooth permission', message: 'Needed to connect to devices', buttonPositive: 'OK' }
      );
      return scan === PermissionsAndroid.RESULTS.GRANTED &&
            connect === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const loc = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
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
        reject(new Error('Bluetooth not PoweredOn'));
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
    opts?: { stopAfterMs?: number; rssiDelta?: number; minIntervalMs?: number }
  ) {
    if (this.isScanning) {
      // stop previous scan before starting a new one
      try { this.manager.stopDeviceScan(); } catch {}
      this.isScanning = false;
      await new Promise(r => setTimeout(r, 200)); // small cool-down
    }

    await this.initialize();
    await this.waitForPoweredOn();

    const stopAfterMs = opts?.stopAfterMs ?? 15000;
    const rssiDelta = opts?.rssiDelta ?? 8; // dBm change threshold
    const minIntervalMs = opts?.minIntervalMs ?? 5000; // throttle same id

    console.log("Starting Scan with", this.ESP_SERVICE_UUID);
    this.isScanning = true;
    this.seen.clear();
    this.last.clear();

    this.manager.startDeviceScan(
      this.ESP_SERVICE_UUID,
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
          console.error("BLE scan error", error);
          return;
        }
        if (!device) return;
        const scanId = getScanId(device);
        if(!scanId) return;

        const now  = Date.now();
        const rssi = device.rssi ?? null;

        if (!this.seen.has(scanId)) {
          console.log(
            "Found:",
            device.name,
            "device.id=",
            device.id,
            "scanId=",
            scanId
          );
          this.seen.add(scanId);
          this.last.set(scanId, { ts: now, rssi });
          onDeviceFound(device);
          return;
        }
      }
    );
    if (stopAfterMs > 0) {
      setTimeout(() => this.stopScan(), stopAfterMs);
    }
  }

  startScan_new(
    onDeviceFound: (device: Device) => void,
    opts: StartOpts = {}
  ): StartScanHandle {
    // If already scanning, stop the previous one first (callable safety)
    if (this.isScanning) {
      try { this.stopScan(); } catch {}
    }

    const mySession = ++this.session;
    this.isScanning = true;
    this.seen.clear();

    // Promise that resolves when this scan ends
    const done = new Promise<void>(resolve => {
      this.currentDoneResolve = () => {
        if (this.session === mySession) resolve();
      };
    });

    const stop = () => {
      if (this.session !== mySession) return; // only stop if this session is current
      try { this.manager.stopDeviceScan(); } catch {}
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
        console.warn('BLE init/poweredOn failed', e);
        stop();
        return;
      }

      console.log('Starting Scan with', this.ESP_SERVICE_UUID);

      this.manager.startDeviceScan(
        this.ESP_SERVICE_UUID,
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
            console.warn('BLE scan error', error);
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
        }
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

  //   console.log('Strating Scan...');
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
  //       console.error('BLE scan error', error);
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
    console.log("Connection response", connected);
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
    serviceUUID: string
  ): Promise<void> {
    try {
      console.log("Sending Data", data);
      const base64 = Buffer.from(data, "utf8").toString("base64");
      const res = await device.writeCharacteristicWithResponseForService(
        serviceUUID,
        DATA_CHAR_UUID,
        base64
      );
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Subscribe to incoming data notifications.
   * Returns a subscription you can call .remove() on when you're done.
   */
  subscribeToData(
    device: Device,
    serviceUUID: string,
    onReceive: (data: string) => void,
    onError?: (error: Error) => void
  ) {
    return device.monitorCharacteristicForService(
      serviceUUID,
      DATA_CHAR_UUID,
      (error, char: Characteristic | null) => {
        if (error) {
          console.warn("BLE notification error", error);
          onError?.(error);
          return;
        }
        console.log("Data received", char);

        if (char?.value) {
          // decode Base64 → UTF8 string
          const received = Buffer.from(char.value, "base64").toString("utf8");
          onReceive(received);
        }
      }
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
      (c) => c.uuid.toLowerCase() === charUUID.toLowerCase()
    );
    if (!target) throw new Error("Characteristic not found");

    if (target.isWritableWithResponse) {
      return device.writeCharacteristicWithResponseForService(
        serviceUUID,
        charUUID,
        base64Payload
      );
    } else if (target.isWritableWithoutResponse) {
      return device.writeCharacteristicWithoutResponseForService(
        serviceUUID,
        charUUID,
        base64Payload
      );
    } else {
      throw new Error("Characteristic not writable");
    }
  }

  async connectedDevices() {
    const connected: Device[] = await this.manager.connectedDevices(
      this.ESP_SERVICE_UUID
    );
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
    } catch (e) {
      console.warn("Error destroying BLE manager", e);
    }
  }

  onDeviceDisconnected(
    deviceId: string,
    cb: (info: { error: Error | null; device: Device | null }) => void
  ): Disposer {
    const sub: Subscription = this.manager.onDeviceDisconnected(
      deviceId,
      (error, device) => {
        cb({ error: error ?? null, device: device ?? null });
      }
    );
    return { remove: () => sub.remove() };
  }

  /**
   * Retrieve any devices already connected to our ESP service.
   * On iOS this returns all OS‐level connected periphs matching the UUID.
   * On Android it may be empty if none are connected right now.
   */
  async getAlreadyConnected(): Promise<Device[]> {
    return await this.manager.connectedDevices(this.ESP_SERVICE_UUID);
  }

  async connectToDevice(deviceId: string) {
    try {
      console.log("Starting connection");
      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: true,
        timeout: 5000,
      });

      return device;
    } catch (err) {
      console.log("connectToDevice", err);
      return null;
    }
  }

  private async resetManager(deviceId: string) {
    try {
      console.log("Resetting");
      this.manager.stopDeviceScan();
      console.log("Stopped");
      await new Promise((res) => setTimeout(res, 100));
      await this.manager.cancelDeviceConnection(deviceId).catch((err) => {
        console.log("cancel", err);
      });
      console.log("Cancelled");

      await new Promise((res) => setTimeout(res, 200));
    } catch (err) {
      console.log("Reset err", err);
    }
  }

  async connectAndDiscover(deviceId: string) {
    try {
      await this.resetManager(deviceId);

      await this.initialize();
      await this.waitForPoweredOn();

      console.log("Trying connection for deviceId", deviceId);

      try {
        const device = await this.manager.connectToDevice(deviceId, {
          autoConnect: true,
          timeout: 5000,
          refreshGatt: "OnConnected",
        });
        console.log("Device", device);
        const discoveredDevice =
          await device.discoverAllServicesAndCharacteristics();
        console.log("Connected and discovered");

        this.connectedDeviceIds.add(deviceId);

        const services = await discoveredDevice.services();

        for (let service of services) {
          console.log("Service:", service.uuid);
          const characteristics = await service.characteristics();
          for (let char of characteristics) {
            console.log("-- Characteristic:", char.uuid);
          }
        }

        // remove from set when it disconnects
        discoveredDevice.onDisconnected(() =>
          this.connectedDeviceIds.delete(deviceId)
        );
        return discoveredDevice;
      } catch (err: any) {
        console.warn(`Attempt error:`, err.message);
      }
    } catch (err) {
      console.error("BLE connect/discover error:", err);
      throw err;
    }
  }

  getCustomServiceId = async (device: Device) => {
    const services = await device.services();
    const customServices = services.filter(
      (service) => !STANDARD_SERVICE_UUIDS.includes(service.uuid.toLowerCase())
    );

    console.log("Custom services only:", customServices);

    return customServices.map((service) => service.uuid);
  };

  cancelDeviceConnection = async (device: Device) => {
    try {
      await this.manager.cancelDeviceConnection(device.id);
    } catch (e) {
      console.log("error", e);
    }
  };

  async connectSafely(
    deviceId: string,
    {
      connectTimeoutMs = 6000,
      scanTimeoutMs = 4000,
      retries = 1,
      autoConnect = false,
      refreshGatt = Platform.OS === "android" ? "OnConnected" : "Never",
    }: ConnectOpts = {}
  ): Promise<Device | null> {
    // 0) BLE on?
    const state = await this.manager.state();
    if (state !== "PoweredOn") {
      // You may want to prompt the user to enable Bluetooth here
      return null;
    }

    // 1) Pre-scan so we don't try connecting to a device that's off
    const seen = await this.scanForPresence(this.manager, {
      deviceId,
      serviceUUIDs: this.ESP_SERVICE_UUID,
      timeoutMs: scanTimeoutMs,
    });
    if (!seen) return null;

    // 2) Connect with retries and proper try/catch
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const device = await this.manager.connectToDevice(deviceId, {
          autoConnect, // prefer false for foreground connects
          timeout: connectTimeoutMs,
        });

        // 3) MTU / connection priority tweaks (optional)
        if (Platform.OS === "android") {
          try {
            await device.requestMTU(185);
          } catch {}
          try {
            await device.requestConnectionPriority(ConnectionPriority.High);
          } catch {}
        }

        // 4) Always discover before any read/write
        await device.discoverAllServicesAndCharacteristics();
        return device; // ✅ success
      } catch (err) {
        lastErr = err;
        // Common transient Android errors: 133, 8, 62… small delay then retry
        await sleep(250 + attempt * 250);
      }
    }
    // 5) Give up gracefully
    console.warn("connectSafely failed:", lastErr);
    return null;
  }

  async scanForPresence(
    manager: BleManager,
    {
      deviceId,
      serviceUUIDs,
      timeoutMs,
    }: { deviceId: string; serviceUUIDs?: string[]; timeoutMs: number }
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
          if (dev && (dev.id === deviceId || !deviceId)) {
            stop();
            resolve(true);
          }
        }
      );

      setTimeout(() => {
        stop();
        resolve(false);
      }, timeoutMs);
    });
  }
}

export default BLEManagerService;
