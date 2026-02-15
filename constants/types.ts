import { Device as BleDevice } from "react-native-ble-plx";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  AddRoom: undefined;
  ConfirmNewBoard: { pendingDeviceId?: string; bleTransportId?: string } | undefined;
  Switchboard: {
    switchboardName: string;
    deviceId: string;
    roomIcon: string;
    status: boolean;
    iosBleId: string | undefined;
    bleId?: string | undefined;
    service_id: string;
    sensors?: string[];
  };
  AddSwitchboard:
    | { roomId: string; pendingDeviceId?: string; prefillName?: string; roomName?: string; roomIcon?: string }
    | undefined;
  AddSwitchboardAdmin: undefined;
  Profile: undefined;
  Room: {
    roomId: string;
    roomName: string;
    roomIcon: string;
    devices: BleDevice[];
  };
};

export type CanonicalId = string;
export interface CanonicalBleDevice {
  /** Stable key for lists/maps — use this for React list keys */
  key: CanonicalId | string; // canonicalId if known, else transportId (device.id)
  /** Canonical cross-platform ID (from DIS/2A25 or your custom char) */
  canonicalId?: CanonicalId;
  /** Transport-specific ID (Android MAC or iOS UUID) */
  transportId: string; // == device.id
  device: BleDevice;
  name: string | null;
  rssi: number | null;
  lastSeen: number;
}

export const ROLES = {
  ADMIN: "admin" as Role,
  USER: "user" as Role,
};

export type Role = "admin" | "user";
