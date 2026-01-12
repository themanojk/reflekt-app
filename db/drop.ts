import { db } from "./index";

export function dropTables() {
  db.execSync(`
    DROP TABLE IF EXISTS switchboards;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS meta;
    DROP TABLE IF EXISTS layout_buttons;
  `);

  console.log("All tables dropped");
}
