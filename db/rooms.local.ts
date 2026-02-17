import { db } from "./index";

export interface RoomLocal {
  id: string;
  name: string;
  icon: string;
  switchboardCount: number;
}

export async function getRoomsLocal(): Promise<RoomLocal[]> {
  return db.getAllAsync<RoomLocal>("SELECT * FROM rooms");
}

export async function upsertRoomLocal(room: RoomLocal): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO rooms
     (id, name, icon, switchboardCount, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [room.id, room.name, room.icon, room.switchboardCount ?? 0, Date.now()]
  );
}

export async function upsertRoomsFromServer(
  serverRooms: RoomLocal[]
): Promise<boolean> {
  const now = Date.now();
  let hasChanged = false;

  const localRooms = await db.getAllAsync<RoomLocal>(
    `SELECT id, name, icon, switchboardCount FROM rooms`
  );

  const localMap = new Map(localRooms.map((r) => [r.id, r]));

  for (const room of serverRooms) {
    const local = localMap.get(room.id);

    if (
      !local ||
      local.name !== room.name ||
      local.icon !== room.icon ||
      local.switchboardCount !== room.switchboardCount
    ) {
      hasChanged = true;

      await db.runAsync(
        `INSERT OR REPLACE INTO rooms
         (id, name, icon, switchboardCount, updatedAt)
         VALUES (?, ?, ?, ?, ?)`,
        [room.id, room.name, room.icon, room.switchboardCount ?? 0, now]
      );
    }
  }

  return hasChanged;
}
