import { open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "../src/database-url";

async function prepare() {
  const url = databaseUrl();
  // Prisma's schema engine can fail before migration when creating a new SQLite file.
  if (url?.startsWith("file:/")) {
    const handle = await open(fileURLToPath(url), "a");
    await handle.close();
  }
}

prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
