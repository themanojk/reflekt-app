import qs from "qs";
import client from "./client";

export interface DatabaseDevice {
  _id: string;
  title: string;
  device_id: string;
  room_id: string;
  user_id: string;
  os: string;
  is_online: boolean;
  is_powered: boolean;
}

export interface NearByDevice {
  _id: string;
  title: string;
  device_id: string;
  room_id: string;
  user_id: string;
  os: string;
  is_online: boolean;
  is_powered: boolean;
  room_name: string;
  room_icon: string;
}

export interface AddDevice {
  title: string;
  room_id: string;
  device_id: string;
  os: string;
}

export interface Button {
  label: string;
  type: string;
  icon: string;
  pin: number;
  command: string;
}

export interface Layout {
  _id: string;
  service_id: string;
  buttons: Button[];
}

export async function fetchDevices(): Promise<DatabaseDevice[]> {
  return client.get("/devices").then((res) => res.data);
}

export async function fetchDevicesByRoom(
  roomId: string
): Promise<DatabaseDevice[]> {
  return client.get(`/devices/room/${roomId}`).then((res) => res.data);
}

export async function addDevice(body: AddDevice): Promise<any> {
  return client.post("/devices/add", body).then((res) => res.data);
}

export async function fetchLayout(serviceId: string): Promise<any> {
  return client.get(`/boards/${serviceId}/layout`).then((res) => res.data);
}

export async function addLayout(serviceId: string, body: any): Promise<any> {
  return client
    .post(`/boards/${serviceId}/device/layout`, body)
    .then((res) => res.data);
}

export async function getLayout(macAddress: string): Promise<Layout> {
  return client
    .get(`/v2/boards/macAddress/${macAddress}/layout`)
    .then((res) => res.data);
}

export async function sendCommandOverWifi(payload: any): Promise<any> {
  return client.post(`/presence`, payload).then((res) => res.data);
}

export async function fetchDevicesByMac(
  deviceIds: string[]
): Promise<NearByDevice[]> {
  return client
    .get(`/devices/macAddresses`, {
      params: { ids: deviceIds },
      paramsSerializer: (params) =>
        qs.stringify(params, { arrayFormat: "repeat" }),
    })
    .then((res) => res.data);
}
