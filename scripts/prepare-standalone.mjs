// Copies assets the standalone server needs next to it: static files, public/, SQL migrations and CV fonts.
import fs from "node:fs";
const out = ".next/standalone";
if (fs.existsSync(out)) {
  fs.cpSync(".next/static", `${out}/.next/static`, { recursive: true });
  if (fs.existsSync("public")) fs.cpSync("public", `${out}/public`, { recursive: true });
  fs.cpSync("db", `${out}/db`, { recursive: true });
  // Embedded fonts for generated CV PDFs (Greek + Latin).
  fs.cpSync("src/assets/fonts", `${out}/src/assets/fonts`, { recursive: true });
}
