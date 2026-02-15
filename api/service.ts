import client from "./client";

const normalizeServiceIds = (ids: string[]): string[] => {
  return Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
};

export async function fetchServiceIds(): Promise<string[]> {
  const res = await client.get("/service");
  return normalizeServiceIds(Array.isArray(res.data) ? res.data : []);
}
