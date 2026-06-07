import { upsertLayoutButtonsFromServer } from "@/db/layout_buttons";
import qs from "qs";
import client from "./client";

export interface DatabaseDevice {
  _id: string;
  name: string;
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
  sensors?: string[];
  sensor_ids?: string[];
}

export interface AdminNearbyDeviceDetails {
  mac_address: string;
  title: string | null;
  service_id: string | null;
  user_name: string | null;
  user_phone: string | null;
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

export interface WifiPayload {
  mac_address: string;
  data: {
    cmd: string;
    pin?: number;
    color?: number[];
    brightness?: number;
    power?: number;
    speed?: number;
  };
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

export interface GetLayoutResult {
  hasChanged: boolean;
  serviceId?: string;
}

export async function getLayout(macAddress: string): Promise<GetLayoutResult> {
  const requestPath = `/v2/boards/macAddress/${macAddress}/layout`;
  console.log("[API][getLayout][request]", {
    method: "GET",
    baseURL: client.defaults.baseURL,
    url: `${client.defaults.baseURL}${requestPath}`,
    macAddress,
  });

  const res = await client.get(requestPath);

  console.log("[API][getLayout][response]", {
    method: "GET",
    url: `${client.defaults.baseURL}${requestPath}`,
    status: res.status,
    macAddress,
    service_id: res.data?.service_id,
    body: res.data,
  });

  const layoutResponse = res.data;
  if (!layoutResponse || typeof layoutResponse !== "object") {
    console.warn("[API][getLayout][empty-body]", {
      method: "GET",
      url: `${client.defaults.baseURL}${requestPath}`,
      status: res.status,
      macAddress,
      body: layoutResponse,
    });
    return { hasChanged: false, serviceId: undefined };
  }

  // 2️⃣ Upsert into local DB + detect changes
  const hasChanged = await upsertLayoutButtonsFromServer(layoutResponse);

  // 3️⃣ Return only change signal
  return { hasChanged, serviceId: layoutResponse?.service_id };
}

export async function sendCommandOverWifi(
  payload: WifiPayload
): Promise<boolean> {
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
    .then((res) => res.data)
    .catch(() => undefined);
}

export async function fetchAdminDeviceDetailsByMac(
  macAddress: string
): Promise<AdminNearbyDeviceDetails | null> {
  const search = String(macAddress || "").trim().toUpperCase();
  if (!search) return null;

  console.log("[API][fetchAdminDeviceDetailsByMac][request]", {
    method: "GET",
    baseURL: client.defaults.baseURL,
    url: `${client.defaults.baseURL}/devices/admin`,
    params: {
      page: 1,
      limit: 1,
      search,
    },
  });

  return client
    .get(`/devices/admin`, {
      params: {
        page: 1,
        limit: 1,
        search,
      },
    })
    .then((res) => {
      console.log("[API][fetchAdminDeviceDetailsByMac][response]", {
        method: "GET",
        url: `${client.defaults.baseURL}/devices/admin`,
        status: res.status,
        search,
        body: res.data,
      });
      const item = Array.isArray(res.data?.data) ? res.data.data[0] : null;
      if (!item) return null;
      const firstUser = Array.isArray(item.users) ? item.users[0] : null;
      const userName = [firstUser?.firstName, firstUser?.lastName]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ");

      return {
        mac_address: String(item.mac_address || search).trim().toUpperCase(),
        title: item.title ? String(item.title).trim() : null,
        service_id: item.service_id ? String(item.service_id).trim() : null,
        user_name: userName || null,
        user_phone: firstUser?.phone ? String(firstUser.phone).trim() : null,
      };
    })
    .catch((error) => {
      console.warn("[API][fetchAdminDeviceDetailsByMac][error]", {
        search,
        message:
          error instanceof Error ? error.message : String(error || "Unknown error"),
        responseStatus: error?.response?.status,
        responseBody: error?.response?.data,
      });
      return null;
    });
}

export async function fetchDevicesByRoomForUser() {
  return client.get(`/devices/by-room`).then((res) => res.data);
}

export async function removeSwitchboard(deviceId: string) {
  return client
    .delete(`/devices/remove/${encodeURIComponent(deviceId)}`)
    .then((res) => res.data);
}

export async function getDeviceStatusOverWifi(macAddress: string) {
  return client
    .get(`/devices/macAddress?mac_address=${macAddress}`)
    .then((res) => res.data);
}

export async function checkSensorAttachment(sensorMac: string) {
  return client
    .get(`/sensor/${encodeURIComponent(sensorMac)}/is-attached`)
    .then((res) => res.data);
}

export async function attachSensorToDevice(
  deviceMac: string,
  sensorMac: string
) {
  return client
    .post(`/sensor/attach-sensor`, {
      device_mac: deviceMac,
      sensor_mac: sensorMac,
    })
    .then((res) => res.data);
}

export async function createSensorRule(
  sensorMac: string,
  pin: number,
  event: "active" | "inactive",
  command: "on" | "off",
  durationSec?: number
) {
  return client
    .post(`/sensor/rule`, {
      sensor_mac: sensorMac,
      event,
      command,
      pin,
      ...(durationSec ? { durationSec } : {}),
    })
    .then((res) => res.data);
}

export async function detachSensorFromDevice(
  deviceMac: string,
  sensorMac: string
) {
  return client
    .post(`/sensor/detach-sensor`, {
      device_mac: deviceMac,
      sensor_mac: sensorMac,
    })
    .then((res) => res.data);
}

export type SensorRangeResponse = {
  sensor_mac: string;
  device_mac: string | null;
  coverage_range_cm: number;
  last_range_applied_cm?: number | null;
  last_range_ack_at?: string | null;
  last_range_ack_status?: string | null;
  last_range_ack_message?: string | null;
};

export async function fetchSensorRange(sensorMac: string) {
  return client
    .get<SensorRangeResponse>(`/sensor/${encodeURIComponent(sensorMac)}/range`)
    .then((res) => res.data);
}

export async function updateSensorRange(
  deviceMac: string,
  sensorMac: string,
  rangeCm: number
) {
  return client
    .post(`/sensor/range`, {
      device_mac: deviceMac,
      sensor_mac: sensorMac,
      range_cm: rangeCm,
    })
    .then((res) => res.data);
}

export async function fetchPinConfigs(deviceMac: string) {
  return client
    .get(`/sensor/pin-config/${encodeURIComponent(deviceMac)}`)
    .then((res) => res.data);
}

export async function savePinConfig(payload: {
  device_mac: string;
  pin: number;
  name: string;
  auto_on: boolean;
  auto_off: boolean;
  off_delay: number;
  load_watt?: number;
  on_exclude_start_hour?: number;
  on_exclude_end_hour?: number;
}) {
  return client.post(`/sensor/pin-config`, payload).then((res) => res.data);
}

export type SwitchSchedule = {
  _id: string;
  mac_address: string;
  pin: number;
  action: "on" | "off";
  timezone: string;
  enabled: boolean;
  label: string;
  mode: "one_time" | "recurring";
  frequency: "once" | "daily" | "weekly";
  days: string[];
  date: string | null;
  time: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
};

export async function fetchSwitchSchedules(deviceMac: string, serviceId?: string) {
  return client
    .get(`/scheduler`, {
      params: {
        mac_address: deviceMac,
        ...(serviceId ? { service_id: serviceId } : {}),
      },
    })
    .then((res) => res.data);
}

export async function createSwitchSchedule(payload: {
  mac_address: string;
  pin: number;
  action: "on" | "off";
  timezone: string;
  mode: "one_time" | "recurring";
  date?: string;
  time: string;
  days?: string[];
  label?: string;
}) {
  return client.post(`/scheduler`, payload).then((res) => res.data);
}

export async function deleteSwitchSchedule(scheduleId: string) {
  return client.delete(`/scheduler/${scheduleId}`).then((res) => res.data);
}
