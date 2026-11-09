import type { IrCommandTemplate } from "@/types/ir";

export type IrExecutePayload =
  | {
      kind: "protocol";
      protocol_code: number;
      value: number;
      bits: number;
      repeat?: number;
      carrier_khz?: number;
    }
  | {
      kind: "raw";
      timings: number[];
      repeat?: number;
      carrier_khz?: number;
    }
  | {
      kind: "ac_state";
      power: boolean;
      temperature: number;
      mode: number | string;
      fan: number | string;
      swing?: boolean | number | string;
      power_mode?: number | string;
      repeat?: number;
    };

const PROTOCOL_CODES: Record<string, number> = {
  RAW: 0,
  NEC: 1,
  SAMSUNG: 2,
  LG: 3,
  LG2: 3,
  SONY: 4,
};

const AC_MODE_CODES: Record<string, number> = {
  COOL: 0,
  DRY: 1,
  FAN: 2,
  AUTO: 3,
  HEAT: 4,
};

const AC_FAN_CODES: Record<string, number> = {
  AUTO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  MAX: 4,
};

const AC_POWER_MODE_CODES: Record<string, number> = {
  NORMAL: 0,
  ECO: 1,
  TURBO: 2,
  SLEEP: 3,
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeAcMode = (value: unknown) => {
  if (typeof value === "string") {
    return AC_MODE_CODES[String(value).trim().toUpperCase()] ?? 0;
  }
  return toFiniteNumber(value, 0);
};

const normalizeAcFan = (value: unknown) => {
  if (typeof value === "string") {
    return AC_FAN_CODES[String(value).trim().toUpperCase()] ?? 0;
  }
  return toFiniteNumber(value, 0);
};

const normalizeAcPowerMode = (value: unknown) => {
  if (typeof value === "string") {
    return AC_POWER_MODE_CODES[String(value).trim().toUpperCase()] ?? 0;
  }
  return toFiniteNumber(value, 0);
};

const normalizeAcSwing = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = String(value).trim().toUpperCase();
    if (normalized === "ON" || normalized === "AUTO" || normalized === "1") {
      return 1;
    }
    return 0;
  }
  return value ? 1 : 0;
};

export const buildIrExecutePayloadFromTemplate = (
  commandTemplate: IrCommandTemplate | null | undefined,
  actionKey: string,
): IrExecutePayload | null => {
  const entry = commandTemplate?.templates?.[actionKey] as Record<string, unknown> | undefined;
  if (!entry || typeof entry !== "object") return null;

  const kind = String(entry.kind || "")
    .trim()
    .toLowerCase();

  if (kind === "protocol") {
    const protocolName = String(entry.protocol || "")
      .trim()
      .toUpperCase();
    const protocolCode = PROTOCOL_CODES[protocolName];
    const value = Number(entry.value);
    const bits = Number(entry.bits);
    if (
      protocolCode === undefined ||
      !Number.isFinite(value) ||
      !Number.isFinite(bits)
    ) {
      return null;
    }

    return {
      kind: "protocol",
      protocol_code: protocolCode,
      value,
      bits,
      repeat: toFiniteNumber(entry.repeat, 1),
      carrier_khz: toFiniteNumber(entry.carrier_khz, 38),
    };
  }

  if (kind === "raw") {
    const timings = Array.isArray(entry.timings)
      ? entry.timings
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item) && item > 0)
      : [];

    if (!timings.length) {
      return null;
    }

    return {
      kind: "raw",
      timings,
      repeat: toFiniteNumber(entry.repeat, 0),
      carrier_khz: toFiniteNumber(entry.carrier_khz, 38),
    };
  }

  if (kind === "ac_state") {
    return {
      kind: "ac_state",
      power: !!entry.power,
      temperature: toFiniteNumber(entry.temperature ?? entry.temp, 24),
      mode: normalizeAcMode(entry.mode),
      fan: normalizeAcFan(entry.fan),
      swing: normalizeAcSwing(entry.swing),
      power_mode: normalizeAcPowerMode(
        entry.power_mode ?? entry.powerMode ?? entry.special,
      ),
      repeat: toFiniteNumber(entry.repeat, 0),
    };
  }

  return null;
};
