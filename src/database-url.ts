import "dotenv/config";
import { resolve } from "node:path";

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  // Use the same absolute SQLite path in Prisma CLI and the runtime adapter.
  return url?.startsWith("file:./") ? "file:" + resolve(url.slice(5)) : url;
}
