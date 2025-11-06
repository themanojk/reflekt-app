import { sleep } from '@/utils/general';
import { getESPServiceIds } from '@/utils/storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import {
  BleManager,
  Characteristic,
  ConnectionPriority,
  Device,
  ScanCallbackType,
  ScanMode,
  Subscription
} from 'react-native-ble-plx';
import {
  PERMISSIONS,
  requestMultiple,
  RESULTS,
} from 'react-native-permissions';
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

class BLEManagerService {
  private connectedDeviceIds = new Set<string>();
  private manager = new BleManager();
  private isScanning = false;
  private appState: AppStateStatus = AppState.currentState;
  private appStateSub?: { remove: () => void };
  public ESP_SERVICE_UUID: string[] = [];

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

  /** Call once at app startup (or before scanning) */
  async initialize() {
    if (Platform.OS === "android" && Platform.Version >= 23) {
      const perms = await requestMultiple([
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
        PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
      ]);
      const ok = Object.values(perms).every(
        (status) => status === RESULTS.GRANTED
      );
      console.log("BLE Permission Response", ok);
      if (!ok) throw new Error("BLE permissions not granted");
    }
  }

  /**
   * Resolves once CBCentralManager reports that Bluetooth is PoweredOn on iOS.
   * (On Android it resolves immediately.)
   */
  async waitForPoweredOn(): Promise<void> {
    return new Promise((resolve) => {
      // check current state first
      this.manager.state().then((s) => {
        if (s === "PoweredOn") {
          resolve();
        } else {
          // subscribe until it becomes powered on
          const sub = this.manager.onStateChange((state) => {
            if (state === "PoweredOn") {
              sub.remove(); // stop listening
              resolve();
            }
          }, true); // `true` means trigger callback immediately with current state
        }
      });
    });
  }

  async startScan(
    onDeviceFound: (device: Device) => void,
    opts?: { stopAfterMs?: number; rssiDelta?: number; minIntervalMs?: number }
  ) {
    if (this.isScanning) return;

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
          this.seen.add(scanId);
          this.last.set(scanId, { ts: now, rssi });
          onDeviceFound(device);
          return;
        }

        const prev = this.last.get(scanId);
        const timeOk = !prev || (now - prev.ts) >= minIntervalMs;
        const rssiOk =
          prev?.rssi == null || rssi == null
            ? false
            : Math.abs(rssi - prev.rssi) >= rssiDelta;

        if (timeOk || rssiOk) {
          console.log(
            "Found:",
            device.name,
            "device.id=",
            device.id,
            "scanId=",
            scanId
          );
          this.last.set(scanId, { ts: now, rssi });
          onDeviceFound(device); // update row in UI if you want live RSSI
        }
      }
    );
    if (stopAfterMs > 0) {
      setTimeout(() => this.stopScan(), stopAfterMs);
    }
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

export default new BLEManagerService();
