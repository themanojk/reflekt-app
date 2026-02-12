import { db } from "./index";

export interface SwitchboardLocal {
  id: string; // deviceId / MAC address
  name: string;

  room_id: string | null;
  room_name: string | null;

  service_id: string; // maps to layout_buttons.layout_id

  icon: string | null;
  color: string | null;
  is_online?: boolean;
  device_id?: string | undefined;

  firmware_version?: string | null;
  updatedAt?: number;
}

export async function getSwitchboardsLocal() {
  return db.getAllAsync<SwitchboardLocal>("SELECT * FROM switchboards");
}

export async function upsertSwitchboardLocal(sb: SwitchboardLocal) {
  console.log("Calling upsert");
  await db.runAsync(
    `INSERT OR REPLACE INTO switchboards
     (id, name, room_name, room_id, service_id, icon, color, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sb.id,
      sb.name,
      sb.room_name,
      sb.room_id,
      sb.service_id,
      sb.icon,
      sb.color,
      Date.now(),
    ],
  );
}

export async function getSwitchboardsByRoomId(
  roomId: string,
): Promise<SwitchboardLocal[]> {
  return db.getAllAsync<SwitchboardLocal>(
    `SELECT * FROM switchboards
     WHERE room_id = ?
     ORDER BY updatedAt DESC`,
    [roomId],
  );
}
