import { Device as BleDevice } from 'react-native-ble-plx';


export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  AddRoom: undefined;
  Switchboard: {switchboardName: string; deviceId: string, roomIcon: string, status: boolean};
  AddSwitchboard: undefined;
  Profile: undefined;
  Room: { roomId: string; roomName: string; roomIcon: string; devices: BleDevice[] };
};
