import { AppState, AppStateStatus, Platform } from 'react-native';
import {
  BleManager,
  Characteristic,
  Device,
  ScanCallbackType,
  ScanMode
} from 'react-native-ble-plx';
import {
  PERMISSIONS,
  requestMultiple,
  RESULTS,
} from 'react-native-permissions';
import { DATA_CHAR_UUID, ESP_SERVICE_UUID, STANDARD_SERVICE_UUIDS } from '../constants';

const Buffer = require('buffer').Buffer;

class BLEManagerService {
  private connectedDeviceIds = new Set<string>();
  private manager = new BleManager();
  private isScanning = false;
  private appState: AppStateStatus = AppState.currentState;
  private appStateSub?: { remove: () => void };

  constructor(){
    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    console.log("App got in background")
    this.appState = nextState;
  };

  /** Call once at app startup (or before scanning) */
  async initialize() {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      const perms = await requestMultiple([
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
        PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
        PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
      ]);
      const ok = Object.values(perms).every(
        status => status === RESULTS.GRANTED,
      );
      console.log('BLE Response', ok);
      if (!ok) throw new Error('BLE permissions not granted');
    }
  }

  /**
   * Resolves once CBCentralManager reports that Bluetooth is PoweredOn on iOS.
   * (On Android it resolves immediately.)
   */
  async waitForPoweredOn(): Promise<void> {
    return new Promise(resolve => {
      // check current state first
      this.manager.state().then(s => {
        if (s === 'PoweredOn') {
          resolve();
        } else {
          // subscribe until it becomes powered on
          const sub = this.manager.onStateChange(state => {
            if (state === 'PoweredOn') {
              sub.remove(); // stop listening
              resolve();
            }
          }, true); // `true` means trigger callback immediately with current state
        }
      });
    });
  }

  /**
   * Start scanning for ESP devices.
   * onDeviceFound is called for each discovered device.
   */
  async startScan(onDeviceFound: (device: Device) => void) {
    if (this.isScanning) return;

    await this.initialize();

    await this.waitForPoweredOn();

    console.log('Strating Scan...');
    this.isScanning = true;

    this.manager.startDeviceScan(ESP_SERVICE_UUID, Platform.select({
    ios: { allowDuplicates: false }, // iOS-only
    android: {
      // Android controls are these, not `allowDuplicates`
      allowDuplicates: false,
      scanMode: ScanMode.LowLatency,
      callbackType: ScanCallbackType.AllMatches, // default, but set explicitly
      // legacyScan: true, // (default) keep unless you know you need otherwise
    },
  }) as any, (error, device) => {
      if (error) {
        console.error('BLE scan error', error);
        return;
      }

      if (device) {
        onDeviceFound(device);
      }
    });
  }

  /** Stop an ongoing scan */
  stopScan() {
    if (!this.isScanning) return;
    this.manager.stopDeviceScan();
    this.isScanning = false;
  }

  /** Connect to a device (with automatic service discovery) */
  async connect(device: Device): Promise<Device> {
    const connected = await device.connect();
    console.log('Connection response', connected);
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
      console.log('Sending Data', data);
      const base64 = Buffer.from(data, 'utf8').toString('base64');
      const res = await device.writeCharacteristicWithResponseForService(
        serviceUUID,
        DATA_CHAR_UUID,
        base64,
      );
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Subscribe to incoming data notifications.
   * Returns a subscription you can call .remove() on when you're done.
   */
  async subscribeToData(
    device: Device,
    serviceUUID: string,
    onReceive: (data: string) => void,
    onError?: (error: Error) => void,
  ) {
    if (Platform.OS === 'android') {
      await device.requestMTU(185); // call before subscribing
    }
    return device.monitorCharacteristicForService(
      serviceUUID,
      DATA_CHAR_UUID,
      (error, char: Characteristic | null) => {
        if (error) {
          console.warn('BLE notification error', error);
          onError?.(error);
          return;
        }
        console.log("Data received", char)
        
        if (char?.value) {
          // decode Base64 → UTF8 string
          const received = Buffer.from(char.value, 'base64').toString('utf8');
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
    device: any;
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
      try { await device.requestMTU(185); } catch {}
    }

    // 4) Confirm the characteristic is writable the way you intend
    const chars = await device.characteristicsForService(serviceUUID);
    const target = chars.find(c => c.uuid.toLowerCase() === charUUID.toLowerCase());
    if (!target) throw new Error("Characteristic not found");

    if (target.isWritableWithResponse) {
      return device.writeCharacteristicWithResponseForService(
        serviceUUID, charUUID, base64Payload
      );
    } else if (target.isWritableWithoutResponse) {
      return device.writeCharacteristicWithoutResponseForService(
        serviceUUID, charUUID, base64Payload
      );
    } else {
      throw new Error("Characteristic not writable");
    }
  }

  async connectedDevices() {
    const connected: Device[] = await this.manager.connectedDevices(
      ESP_SERVICE_UUID,
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
      console.warn('Error destroying BLE manager', e);
    }
  }

  /**
   * Retrieve any devices already connected to our ESP service.
   * On iOS this returns all OS‐level connected periphs matching the UUID.
   * On Android it may be empty if none are connected right now.
   */
  async getAlreadyConnected(): Promise<Device[]> {
    return await this.manager.connectedDevices(ESP_SERVICE_UUID);
  }

  async connectToDevice(deviceId: string) {
    try {
      console.log('Starting connection');
      const device = await this.manager.connectToDevice(deviceId, {
        autoConnect: true,
        timeout: 5000,
      });

      return device;
    } catch (err) {
      console.log('connectToDevice', err);
      return null;
    }
  }

  private async resetManager(deviceId: string) {
    try {
      console.log("Resetting")
      this.manager.stopDeviceScan();
      console.log("Stopped")
      await new Promise(res => setTimeout(res, 100));
      await this.manager.cancelDeviceConnection(deviceId).catch((err) => {console.log("cancel", err)});
      console.log("Cancelled")

      await new Promise(res => setTimeout(res, 200));
    }catch(err) {
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
        const discoveredDevice = await device.discoverAllServicesAndCharacteristics();
        console.log('✅ Connected and discovered');

        this.connectedDeviceIds.add(deviceId);

        const services = await discoveredDevice.services();

        for (let service of services) {
          console.log('Service:', service.uuid);
          const characteristics = await service.characteristics();
          for (let char of characteristics) {
            console.log('-- Characteristic:', char.uuid);
          }
        }

        // remove from set when it disconnects
        discoveredDevice.onDisconnected(() => this.connectedDeviceIds.delete(deviceId));
        return discoveredDevice;
      } catch (err: any) {
        console.warn(`Attempt error:`, err.message);
      }
      
    } catch (err) {
      console.error('BLE connect/discover error:', err);
      throw err;
    }
  }

  getCustomServiceId = async (device: Device) => {
    const services = await device.services();
    const customServices = services.filter(
      service => !STANDARD_SERVICE_UUIDS.includes(service.uuid.toLowerCase())
    );

    console.log('Custom services only:', customServices);

    return customServices.map(service => service.uuid)
  }

  cancelDeviceConnection = async (device: Device) => {

      try {
        await this.manager.cancelDeviceConnection(device.id);
      } catch (e) {
        console.log("error", e)
      }
    
  }
}

export default new BLEManagerService();
