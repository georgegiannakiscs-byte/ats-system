// Copies assets the standalone server needs next to it: static files, public/ and SQL migrations.
import fs from "node:fs";
const out = ".next/standalone";
if (fs.existsSync(out)) {
  fs.cpSync(".next/static", `${out}/.next/static`, { recursive: true });
  if (fs.existsSync("public")) fs.cpSync("public", `${out}/public`, { recursive: true });
  fs.cpSync("db", `${out}/db`, { recursive: true });
}
