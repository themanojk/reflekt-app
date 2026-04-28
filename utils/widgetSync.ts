import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { getToken } from "./storage";

const WIDGET_SNAPSHOT_KEY = "@widget:home:snapshot";
const WIDGET_FAVORITES_KEY = "@widget:favorites:switches";

type WidgetBridgeModule = {
  setHomeWidgetSnapshot?: (
    snapshotJson: string,
    appGroupId?: string,
    widgetKind?: string,
  ) => Promise<void> | void;
  reloadWidgets?: (widgetKind?: string) => Promise<void> | void;
};

type WidgetRoom = {
  id: string;
  name: string;
  icon: string;
  switchboardCount: number;
  onlineCount: number;
};

export type HomeWidgetSnapshot = {
  appName: string;
  updatedAtISO: string;
  totalRooms: number;
  totalBoards: number;
  onlineBoards: number;
  rooms: WidgetRoom[];
  favorites?: WidgetFavoriteSwitch[];
  apiBaseURL?: string;
  authToken?: string;
};

export type WidgetFavoriteSwitch = {
  id: string;
  deviceMac: string;
  serviceId?: string;
  pin: number;
  roomName?: string;
  boardName?: string;
  switchName: string;
  switchType?: string;
  isOn?: boolean;
  updatedAtISO: string;
};

type RoomWithBoards = {
  room: {
    id: string;
    name: string;
    icon: string;
    switchboardCount?: number;
  };
  devices: {
    id: string;
    is_online?: boolean;
  }[];
};

const getWidgetConfig = () => {
  const extra = (Constants.expoConfig?.extra || {}) as any;
  const widget = extra?.widget || {};
  return {
    appGroupId: String(widget.iosAppGroup || "group.com.littra.reflekt"),
    widgetKind: String(widget.kind || "ReflektWidget"),
    appName: String(widget.appName || "Littra One Touch"),
  };
};

const bridge = NativeModules.WidgetBridge as WidgetBridgeModule | undefined;

export const buildHomeWidgetSnapshot = (
  rows: RoomWithBoards[],
): HomeWidgetSnapshot => {
  const rooms = (Array.isArray(rows) ? rows : []).map((item) => {
    const safeDevices = Array.isArray(item.devices) ? item.devices : [];
    const onlineCount = safeDevices.filter((d) => !!d.is_online).length;
    return {
      id: String(item.room?.id || ""),
      name: String(item.room?.name || "Room"),
      icon: String(item.room?.icon || "home"),
      switchboardCount:
        Number(item.room?.switchboardCount) || safeDevices.length || 0,
      onlineCount,
    };
  });

  const totalBoards = rooms.reduce((acc, r) => acc + r.switchboardCount, 0);
  const onlineBoards = rooms.reduce((acc, r) => acc + r.onlineCount, 0);
  const { appName } = getWidgetConfig();

  return {
    appName,
    updatedAtISO: new Date().toISOString(),
    totalRooms: rooms.length,
    totalBoards,
    onlineBoards,
    // keep payload small and widget-friendly
    rooms: rooms.slice(0, 6),
  };
};

export const syncHomeWidgetSnapshot = async (rows: RoomWithBoards[]) => {
  const snapshot = buildHomeWidgetSnapshot(rows);
  snapshot.favorites = await getWidgetFavorites();
  snapshot.apiBaseURL = "https://reflekt.onrender.com";
  snapshot.authToken = (await getToken()) || undefined;
  const payload = JSON.stringify(snapshot);
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, payload);

  if (Platform.OS !== "ios" || !bridge?.setHomeWidgetSnapshot) return;

  const { appGroupId, widgetKind } = getWidgetConfig();
  try {
    await bridge.setHomeWidgetSnapshot(payload, appGroupId, widgetKind);
    await bridge.reloadWidgets?.(widgetKind);
  } catch (error) {
    console.log("Widget sync skipped:", error);
  }
};

export const getWidgetFavorites = async (): Promise<WidgetFavoriteSwitch[]> => {
  const raw = await AsyncStorage.getItem(WIDGET_FAVORITES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const setWidgetFavorites = async (favorites: WidgetFavoriteSwitch[]) => {
  const next = Array.isArray(favorites) ? favorites.slice(0, 4) : [];
  await AsyncStorage.setItem(WIDGET_FAVORITES_KEY, JSON.stringify(next));
  await syncWidgetSnapshotFromCache();
};

export const toggleWidgetFavoriteSwitch = async (
  favorite: Omit<WidgetFavoriteSwitch, "updatedAtISO">,
  max = 4,
) => {
  const current = await getWidgetFavorites();
  const idx = current.findIndex((item) => item.id === favorite.id);

  if (idx >= 0) {
    const next = current.filter((_, i) => i !== idx);
    await setWidgetFavorites(next);
    return { added: false, limitReached: false };
  }

  if (current.length >= max) {
    return { added: false, limitReached: true };
  }

  const next = [
    ...current,
    {
      ...favorite,
      updatedAtISO: new Date().toISOString(),
    },
  ];
  await setWidgetFavorites(next);
  return { added: true, limitReached: false };
};

export const updateWidgetFavoriteSwitchState = async (
  deviceMac: string,
  pin: number,
  isOn: boolean,
) => {
  const normalizedMac = String(deviceMac || "")
    .trim()
    .toUpperCase();
  if (!normalizedMac || !Number.isFinite(pin)) return;
  const current = await getWidgetFavorites();
  let changed = false;
  const next = current.map((item) => {
    if (item.deviceMac !== normalizedMac || Number(item.pin) !== Number(pin)) {
      return item;
    }
    changed = true;
    return {
      ...item,
      isOn,
      updatedAtISO: new Date().toISOString(),
    };
  });
  if (!changed) return;
  await setWidgetFavorites(next);
};

export const syncWidgetSnapshotFromCache = async () => {
  const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
  try {
    const baseSnapshot = raw
      ? (JSON.parse(raw) as HomeWidgetSnapshot)
      : {
          appName: getWidgetConfig().appName,
          updatedAtISO: new Date().toISOString(),
          totalRooms: 0,
          totalBoards: 0,
          onlineBoards: 0,
          rooms: [],
        };
    const snapshot = baseSnapshot;
    snapshot.favorites = await getWidgetFavorites();
    snapshot.apiBaseURL = "https://reflekt.onrender.com";
    snapshot.authToken = (await getToken()) || undefined;
    snapshot.updatedAtISO = new Date().toISOString();
    const payload = JSON.stringify(snapshot);
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, payload);
    if (Platform.OS !== "ios" || !bridge?.setHomeWidgetSnapshot) return;
    const { appGroupId, widgetKind } = getWidgetConfig();
    await bridge.setHomeWidgetSnapshot(payload, appGroupId, widgetKind);
    await bridge.reloadWidgets?.(widgetKind);
  } catch {}
};

export const getCachedHomeWidgetSnapshot = async () => {
  const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HomeWidgetSnapshot;
  } catch {
    return null;
  }
};
