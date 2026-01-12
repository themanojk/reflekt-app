import { db } from "./index";

export interface LayoutButtonLocal {
  id: string;
  service_id: string;
  label: string;
  type: string;
  command: string;
  pin: number;
  icon: string | null;
  position: number;
  is_enabled: number;
  updatedAt: number;
}
export interface ServerLayoutResponse {
  service_id: string;
  buttons: ServerButton[];
  updatedAt: string;
}

export interface ServerButton {
  _id: string;
  label: string;
  type: string;
  command: string;
  pin: number;
  icon?: string;
}

export async function getLayoutButtonsByServiceId(
  serviceId: string
): Promise<LayoutButtonLocal[]> {
  return await db.getAllAsync<LayoutButtonLocal>(
    `
    SELECT *
    FROM layout_buttons
    WHERE service_id = ?
      AND is_enabled = 1
    ORDER BY position ASC
    `,
    [serviceId]
  );
}

export async function upsertLayoutButtonsFromServer(
  payload: ServerLayoutResponse
): Promise<boolean> {
  const { service_id, buttons } = payload;
  const now = Date.now();

  let hasChanged = false;

  const localButtons = await db.getAllAsync<{
    id: string;
    label: string;
    type: string;
    command: string;
    pin: number;
    position: number;
  }>(
    `SELECT id, label, type, command, pin, position
     FROM layout_buttons
     WHERE service_id = ?`,
    [service_id]
  );

  const localMap = new Map(localButtons.map((b) => [b.id, b]));
  const serverIdSet = new Set<string>();

  // ADD / UPDATE
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    serverIdSet.add(btn._id);

    const local = localMap.get(btn._id);

    if (
      !local ||
      local.label !== btn.label ||
      local.type !== btn.type ||
      local.command !== btn.command ||
      local.pin !== btn.pin ||
      local.position !== i
    ) {
      hasChanged = true;

      await db.runAsync(
        `
        INSERT OR REPLACE INTO layout_buttons
        (id, service_id, label, type, command, pin, icon, position, is_enabled, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `,
        [
          btn._id,
          service_id,
          btn.label,
          btn.type,
          btn.command,
          btn.pin,
          btn.icon ?? null,
          i,
          now,
        ]
      );
    }
  }

  // DISABLE REMOVED
  for (const local of localButtons) {
    if (!serverIdSet.has(local.id)) {
      hasChanged = true;

      await db.runAsync(
        `
        UPDATE layout_buttons
        SET is_enabled = 0, updatedAt = ?
        WHERE id = ? AND service_id = ?
        `,
        [now, local.id, service_id]
      );
    }
  }

  return hasChanged;
}
