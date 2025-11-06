import client from "./client";

export async function fetchServiceIds(): Promise<string[]> {
  return client.get("/service").then((res) => res.data);
}