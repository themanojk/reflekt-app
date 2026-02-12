import { db } from "./index";

export interface PinConfigLocal {
  id: string; // device_mac:pin
  device_mac: string;
  pin: number;
  name: string;
  auto_on: number;
  auto_off: number;
  off_delay: number;
  load_watt: number;
  on_exclude_start_hour: number;
  on_exclude_end_hour: number;
  updatedAt: number;
  pending_sync: number;
}

export async function getPinConfigsByDevice(
  deviceMac: string
): Promise<PinConfigLocal[]> {
  return db.getAllAsync<PinConfigLocal>(
    `
    SELECT *
    FROM pin_configs
    WHERE device_mac = ?
    ORDER BY pin ASC
    `,
    [deviceMac.toUpperCase()]
  );
}

export async function upsertPinConfigLocal(
  cfg: Omit<PinConfigLocal, "id" | "updatedAt"> & { updatedAt?: number }
) {
  const now = cfg.updatedAt ?? Date.now();
  const id = `${cfg.device_mac.toUpperCase()}:${cfg.pin}`;
  await db.runAsync(
    `
    INSERT OR REPLACE INTO pin_configs
    (id, device_mac, pin, name, auto_on, auto_off, off_delay, load_watt, on_exclude_start_hour, on_exclude_end_hour, updatedAt, pending_sync)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      cfg.device_mac.toUpperCase(),
      cfg.pin,
      cfg.name,
      cfg.auto_on,
      cfg.auto_off,
      cfg.off_delay,
      cfg.load_watt ?? 0,
      cfg.on_exclude_start_hour ?? 22,
      cfg.on_exclude_end_hour ?? 7,
      now,
      cfg.pending_sync ?? 0,
    ]
  );
}

export async function getPendingPinConfigs(): Promise<PinConfigLocal[]> {
  return db.getAllAsync<PinConfigLocal>(
    `
    SELECT *
    FROM pin_configs
    WHERE pending_sync = 1
    `
  );
}

export async function markPinConfigSynced(deviceMac: string, pin: number) {
  const id = `${deviceMac.toUpperCase()}:${pin}`;
  await db.runAsync(
    `
    UPDATE pin_configs
    SET pending_sync = 0, updatedAt = ?
    WHERE id = ?
    `,
    [Date.now(), id]
  );
}
