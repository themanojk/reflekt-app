export const buildFanStatusSignature = (status: any) => {
  const fanPin = Number(status?.fan_pin);
  const fanSpeed = Number(status?.fan_speed);
  const fanStatus =
    typeof status?.fan_status === "boolean" ? status.fan_status : null;
  const online = !!status?.online;

  return JSON.stringify({
    fanPin: Number.isFinite(fanPin) ? fanPin : null,
    fanSpeed: Number.isFinite(fanSpeed) ? fanSpeed : null,
    fanStatus,
    online,
  });
};
