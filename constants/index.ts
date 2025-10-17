import { Bath, Bed, Coffee, Fan, Hop as Home, Lamp, Lightbulb, Plug, Sofa, Tv, Utensils } from 'lucide-react-native';

export const ESP_SERVICE_UUID = [
  "3f542309-50a0-4edb-aa41-c4d068dc72f5",
  "3f542309-50a0-4edb-aa41-c4d068dc72f4",
  "12345678-1234-1234-1234-1234567890ab",
];

export const DATA_CHAR_UUID = '39861dbb-c278-4e78-a542-17468828adb9';


export const STANDARD_SERVICE_UUIDS = [
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
];

export const ROOM_ICONS: { [key: string]: any } = {
  'home': Home,
  'bed': Bed,
  'coffee': Coffee,
  'tv': Tv,
  'bath': Bath,
  'utensils' : Utensils,
  'sofa': Sofa,
  'lamp': Lamp,
  'switch': Lightbulb,
  'dimmer': Lightbulb,
  'rgb_led': Lightbulb,
  'fan': Fan,
  'outlet': Plug
};