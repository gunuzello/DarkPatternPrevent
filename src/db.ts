import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { databaseUrl } from "./database-url";
import { PrismaClient } from "./generated/prisma/client";

const shared = globalThis as typeof globalThis & { scanDb?: PrismaClient };

export function db() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL을 설정하세요.");
  return shared.scanDb ??= new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
