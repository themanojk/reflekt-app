import { fetchDevices } from "@/api/devics";
import { getRooms } from "@/api/room";
import { upsertRoomLocal } from "@/db/rooms.local";
import { upsertSwitchboardLocal } from "@/db/switchboards.local";

const COLORS = ["#5b8def", "#7c6fd8", "#4ade80", "#fbbf24"];

export interface SyncParams {
  nearbyDeviceIds?: string[]; // BLE discovered ids
}

export async function syncAppData(params?: SyncParams) {
  const { nearbyDeviceIds = [] } = params || {};
  const roomsObj = {};
  /* -------------------- ROOMS -------------------- */
  try {
    const rooms = await getRooms();
    rooms.forEach((r) => {
      upsertRoomLocal({
        id: r._id,
        name: r.name,
        icon: r.icon,
        switchboardCount: r.switchboardCount,
      });
      roomsObj[r["_id"]] = {
        id: r._id,
        name: r.name,
        icon: r.icon,
        switchboardCount: r.switchboardCount,
      };
    });
  } catch (e) {
    console.warn("Room sync skipped", e);
  }

  /* ---------------- SWITCHBOARDS ---------------- */
  if (true) {
    try {
      const devices = await fetchDevices();

      devices.forEach(async (d) => {
        await upsertSwitchboardLocal({
          id: d.device_id,
          name: d.title,
          room_id: d["room_id"],
          service_id: d["service_id"] || "",
          room_name: roomsObj[d["room_id"]].name,
          icon: roomsObj[d["room_id"]].icon,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      });
    } catch (e) {
      console.warn("Switchboard sync skipped", e);
    }
  }
}
