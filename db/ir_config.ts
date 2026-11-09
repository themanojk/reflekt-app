import { db } from "./index";
import type {
  IrCatalogProfile,
  IrCommandTemplate,
  IrWidgetBinding,
} from "@/types/ir";

export interface IrWidgetBindingLocal extends IrWidgetBinding {
  quick_actions_json: string;
  last_known_state_json: string | null;
  updatedAt: number;
  pending_sync: number;
}

export interface IrCatalogCacheLocal {
  catalog_id: string;
  profile_json: string;
  command_template_json: string | null;
  updatedAt: number;
}

const parseBindingRow = (row: IrWidgetBindingLocal): IrWidgetBinding => ({
  binding_id: row.binding_id,
  service_id: row.service_id,
  hub_device_mac: row.hub_device_mac,
  hub_pin: Number(row.hub_pin),
  ir_module_mac: row.ir_module_mac,
  device_type: row.device_type,
  catalog_id: row.catalog_id,
  command_mode: row.command_mode,
  display_name: row.display_name,
  quick_actions: JSON.parse(row.quick_actions_json || "[]"),
  last_known_state: row.last_known_state_json
    ? JSON.parse(row.last_known_state_json)
    : null,
  status: row.status,
});

export async function getIrWidgetBindingsLocal(
  serviceId: string,
): Promise<IrWidgetBinding[]> {
  const rows = await db.getAllAsync<IrWidgetBindingLocal>(
    `
    SELECT *
    FROM ir_widget_bindings
    WHERE service_id = ?
    ORDER BY hub_pin ASC, updatedAt DESC
    `,
    [String(serviceId || "").trim()],
  );

  return rows.map(parseBindingRow);
}

export async function upsertIrWidgetBindingLocal(
  binding: IrWidgetBinding,
  pendingSync = 0,
): Promise<void> {
  await db.runAsync(
    `
    INSERT OR REPLACE INTO ir_widget_bindings
    (
      binding_id,
      service_id,
      hub_device_mac,
      hub_pin,
      ir_module_mac,
      device_type,
      catalog_id,
      command_mode,
      display_name,
      quick_actions_json,
      last_known_state_json,
      status,
      updatedAt,
      pending_sync
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      binding.binding_id,
      String(binding.service_id || "").trim(),
      String(binding.hub_device_mac || "").trim().toUpperCase(),
      Number(binding.hub_pin),
      String(binding.ir_module_mac || "").trim().toUpperCase(),
      binding.device_type,
      binding.catalog_id,
      binding.command_mode,
      binding.display_name,
      JSON.stringify(binding.quick_actions || []),
      binding.last_known_state
        ? JSON.stringify(binding.last_known_state)
        : null,
      binding.status,
      Date.now(),
      pendingSync ? 1 : 0,
    ],
  );
}

export async function deleteIrWidgetBindingLocal(bindingId: string): Promise<void> {
  await db.runAsync(
    `
    DELETE FROM ir_widget_bindings
    WHERE binding_id = ?
    `,
    [bindingId],
  );
}

export async function getPendingIrWidgetBindingsLocal(): Promise<
  IrWidgetBinding[]
> {
  const rows = await db.getAllAsync<IrWidgetBindingLocal>(
    `
    SELECT *
    FROM ir_widget_bindings
    WHERE pending_sync = 1
    ORDER BY updatedAt ASC
    `,
  );

  return rows.map(parseBindingRow);
}

export async function markIrWidgetBindingSynced(
  bindingId: string,
): Promise<void> {
  await db.runAsync(
    `
    UPDATE ir_widget_bindings
    SET pending_sync = 0, updatedAt = ?
    WHERE binding_id = ?
    `,
    [Date.now(), bindingId],
  );
}

export async function upsertIrCatalogCacheLocal(
  profile: IrCatalogProfile,
  commandTemplate: IrCommandTemplate | null,
): Promise<void> {
  await db.runAsync(
    `
    INSERT OR REPLACE INTO ir_catalog_cache
    (
      catalog_id,
      profile_json,
      command_template_json,
      updatedAt
    )
    VALUES (?, ?, ?, ?)
    `,
    [
      profile.catalog_id,
      JSON.stringify(profile),
      commandTemplate ? JSON.stringify(commandTemplate) : null,
      Date.now(),
    ],
  );
}

export async function getIrCatalogCacheLocal(
  catalogId: string,
): Promise<{ profile: IrCatalogProfile | null; commandTemplate: IrCommandTemplate | null }> {
  const row = await db.getFirstAsync<IrCatalogCacheLocal>(
    `
    SELECT *
    FROM ir_catalog_cache
    WHERE catalog_id = ?
    `,
    [catalogId],
  );

  if (!row) {
    return {
      profile: null,
      commandTemplate: null,
    };
  }

  return {
    profile: row.profile_json ? JSON.parse(row.profile_json) : null,
    commandTemplate: row.command_template_json
      ? JSON.parse(row.command_template_json)
      : null,
  };
}
