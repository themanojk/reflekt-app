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
  sensors?: string; // comma-separated sensor MACs
  updatedAt?: number;
}

export async function getSwitchboardsLocal() {
  return db.getAllAsync<SwitchboardLocal>("SELECT * FROM switchboards");
}

export async function upsertSwitchboardLocal(sb: SwitchboardLocal) {
  console.log("Calling upsert");
  await db.runAsync(
    `INSERT OR REPLACE INTO switchboards
     (id, name, room_name, room_id, service_id, icon, color, sensors, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sb.id,
      sb.name,
      sb.room_name,
      sb.room_id,
      sb.service_id,
      sb.icon,
      sb.color,
      sb.sensors || "",
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

export async function updateSwitchboardSensorsLocal(
  deviceId: string,
  sensors: string[],
) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(sensors) ? sensors : [])
        .map((s) => String(s || "").trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  await db.runAsync(
    `UPDATE switchboards
     SET sensors = ?, updatedAt = ?
     WHERE UPPER(id) = UPPER(?)`,
    [normalized.join(","), Date.now(), deviceId],
  );
}
