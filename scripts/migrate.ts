import { migrate } from "../src/server/migrate";

const url = process.env.DATABASE_URL ?? "postgres://deceler:deceler_dev@localhost:5432/deceler";
migrate(url).then(() => console.log("[db] up to date")).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
