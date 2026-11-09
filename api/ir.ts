import client from "./client";
import type {
  CreateIrWidgetBindingInput,
  IrCatalogProfile,
  IrCatalogProfileResponse,
  IrDeviceType,
  IrWidgetBinding,
  UpdateIrWidgetBindingInput,
} from "@/types/ir";

export async function fetchIrDeviceTypes(): Promise<IrDeviceType[]> {
  return client.get("/ir/catalog/device-types").then((res) => res.data?.device_types || []);
}

export async function fetchIrBrands(deviceType: IrDeviceType): Promise<string[]> {
  return client
    .get("/ir/catalog/brands", { params: { deviceType } })
    .then((res) => res.data?.brands || []);
}

export async function fetchIrModels(
  deviceType: IrDeviceType,
  brand: string
): Promise<IrCatalogProfile[]> {
  return client
    .get("/ir/catalog/models", { params: { deviceType, brand } })
    .then((res) => res.data?.models || []);
}

export async function fetchIrCatalogProfile(
  catalogId: string
): Promise<IrCatalogProfileResponse> {
  return client.get(`/ir/catalog/profile/${catalogId}`).then((res) => res.data);
}

export async function fetchIrWidgetBindingsByService(
  serviceId: string
): Promise<IrWidgetBinding[]> {
  return client
    .get(`/ir/widget-bindings/service/${serviceId}`)
    .then((res) => res.data?.bindings || []);
}

export async function createIrWidgetBinding(
  body: CreateIrWidgetBindingInput
): Promise<IrWidgetBinding> {
  return client.post("/ir/widget-bindings", body).then((res) => res.data?.binding);
}

export async function updateIrWidgetBinding(
  bindingId: string,
  body: UpdateIrWidgetBindingInput
): Promise<IrWidgetBinding> {
  return client
    .patch(`/ir/widget-bindings/${bindingId}`, body)
    .then((res) => res.data?.binding);
}
