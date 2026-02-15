import { openDatabaseSync, SQLiteDatabase } from "expo-sqlite";

export const db: SQLiteDatabase = openDatabaseSync("littra.db");

export function initDB() {
  db.execSync(`
    -- =====================
    -- ROOMS
    -- =====================
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      icon TEXT,
      switchboardCount INTEGER,
      updatedAt INTEGER
    );

    -- =====================
    -- SWITCHBOARDS
    -- =====================
    CREATE TABLE IF NOT EXISTS switchboards (
    id TEXT PRIMARY KEY,         -- deviceId / MAC
    name TEXT,
    room_id TEXT,
    room_name TEXT,
    service_id TEXT,              -- logical layout identifier
    icon TEXT,
    color TEXT,
    firmware_version TEXT,
    updatedAt INTEGER,

    FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE SET NULL
    );

    -- =====================
    -- BUTTONS / CHANNELS
    -- =====================
    CREATE TABLE IF NOT EXISTS layout_buttons (
    id TEXT PRIMARY KEY,         -- buttonId from server
    service_id TEXT,              -- mapped from switchboards.service_id
    label TEXT,
    type TEXT,                   -- light | fan | plug
    command TEXT,                -- toggle | dim | speed
    pin INTEGER,
    icon TEXT,
    position INTEGER,
    is_enabled INTEGER DEFAULT 1,
    updatedAt INTEGER
    );


    -- =====================
    -- INDEXES (IMPORTANT)
    -- =====================
    CREATE INDEX IF NOT EXISTS idx_layout_buttons_service_id
    ON layout_buttons(service_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pin_per_layout
    ON layout_buttons(service_id, pin);

    -- =====================
    -- PIN CONFIGS (Motion Rules + Names)
    -- =====================
    CREATE TABLE IF NOT EXISTS pin_configs (
    id TEXT PRIMARY KEY,         -- device_mac:pin
    device_mac TEXT,
    pin INTEGER,
    name TEXT,
    auto_on INTEGER,
    auto_off INTEGER,
    off_delay INTEGER,
    load_watt INTEGER DEFAULT 0,
    on_exclude_start_hour INTEGER DEFAULT 22,
    on_exclude_end_hour INTEGER DEFAULT 7,
    updatedAt INTEGER,
    pending_sync INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pin_configs_device
    ON pin_configs(device_mac);

  `);

  // Lightweight migration for older installs
  try {
    db.execSync(
      "ALTER TABLE pin_configs ADD COLUMN on_exclude_start_hour INTEGER DEFAULT 22"
    );
  } catch {}
  try {
    db.execSync(
      "ALTER TABLE pin_configs ADD COLUMN on_exclude_end_hour INTEGER DEFAULT 7"
    );
  } catch {}
  try {
    db.execSync(
      "ALTER TABLE pin_configs ADD COLUMN load_watt INTEGER DEFAULT 0"
    );
  } catch {}
  try {
    db.execSync(
      "ALTER TABLE switchboards ADD COLUMN sensors TEXT DEFAULT ''"
    );
  } catch {}
}
