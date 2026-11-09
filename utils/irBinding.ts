import type {
  CreateIrWidgetBindingInput,
  IrCatalogProfile,
  IrWidgetBinding,
} from "@/types/ir";

export const getDefaultIrQuickActions = (
  deviceType: IrCatalogProfile["device_type"],
): string[] => {
  switch (deviceType) {
    case "AC":
      return ["power_on", "power_off", "temp_up", "temp_down"];
    case "TV":
      return ["power", "volume_up", "volume_down", "mute"];
    case "RGB_LIGHT":
      return ["power", "brightness_up", "brightness_down"];
    case "FAN":
      return ["power", "speed_up", "speed_down"];
    default:
      return ["power"];
  }
};

export const buildLocalIrWidgetBinding = ({
  payload,
  profile,
  existingBindingId,
}: {
  payload: CreateIrWidgetBindingInput;
  profile: IrCatalogProfile;
  existingBindingId?: string | null;
}): IrWidgetBinding => ({
  binding_id:
    existingBindingId ||
    `local:${payload.service_id}:${payload.hub_pin}:${Date.now()}`,
  service_id: payload.service_id,
  hub_device_mac: payload.hub_device_mac,
  hub_pin: payload.hub_pin,
  ir_module_mac: payload.ir_module_mac,
  device_type: profile.device_type,
  catalog_id: payload.catalog_id,
  command_mode: profile.command_mode,
  display_name: payload.display_name,
  quick_actions: payload.quick_actions || [],
  last_known_state: payload.last_known_state ?? null,
  status: "active",
});
