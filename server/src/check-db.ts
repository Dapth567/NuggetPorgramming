// Read-only check that the server can reach every table: `npm run check:db`.
import { db } from "./db.js";

const TABLES = ["users", "groups", "group_members", "messages"];

let failed = false;

for (const table of TABLES) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) {
    failed = true;
    console.log(`${table}: FAILED - ${error.message}`);
  } else {
    console.log(`${table}: OK (${count} rows)`);
  }
}

process.exitCode = failed ? 1 : 0;
