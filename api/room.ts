import client from "./client";

export interface Room {
  _id: string;
  name: string;
  icon: string;
  switchboardCount: number;
}

export async function addRoom(name: string, icon: string): Promise<Room> {
  return client.post("/rooms", { name, icon }).then((res) => res.data);
}

export async function getRooms(): Promise<Room[]> {
  return client.get("/rooms").then((res) => res.data);
}
