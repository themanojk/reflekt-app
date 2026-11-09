export type IrDeviceType = "AC" | "TV" | "RGB_LIGHT" | "FAN" | "CUSTOM";
export type IrCommandMode = "ac_state" | "discrete_buttons" | "protocol" | "raw";

export interface IrCatalogProfile {
  _id?: string;
  catalog_id: string;
  device_type: IrDeviceType;
  brand: string;
  model: string;
  display_name: string;
  command_mode: IrCommandMode;
  supported_features?: Record<string, unknown>;
  default_state?: Record<string, unknown> | null;
  status: "active" | "deprecated" | "draft";
  version: number;
}

export interface IrCommandTemplate {
  _id?: string;
  template_id: string;
  catalog_id: string;
  command_mode: IrCommandMode;
  transport_encoding: string;
  templates: Record<string, Record<string, unknown>>;
}

export interface IrCatalogProfileResponse {
  profile: IrCatalogProfile;
  command_template: IrCommandTemplate | null;
}

export interface IrWidgetBinding {
  _id?: string;
  binding_id: string;
  service_id: string;
  hub_device_mac: string;
  hub_pin: number;
  ir_module_mac: string;
  device_type: IrDeviceType;
  catalog_id: string;
  command_mode: IrCommandMode;
  display_name: string;
  quick_actions: string[];
  last_known_state?: Record<string, unknown> | null;
  created_by?: string | null;
  status: "active" | "inactive" | "archived";
}

export interface CreateIrWidgetBindingInput {
  service_id: string;
  hub_device_mac: string;
  hub_pin: number;
  ir_module_mac: string;
  catalog_id: string;
  display_name: string;
  quick_actions?: string[];
  last_known_state?: Record<string, unknown> | null;
}

export interface UpdateIrWidgetBindingInput {
  display_name?: string;
  quick_actions?: string[];
  last_known_state?: Record<string, unknown> | null;
  status?: IrWidgetBinding["status"];
}
