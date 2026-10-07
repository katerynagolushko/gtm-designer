import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabaseUrl } from "./database-url";

const resolved = resolveDatabaseUrl();
if (resolved) {
  process.env.DATABASE_URL = resolved;
} else if (!process.env.DATABASE_URL || (process.env.VERCEL === "1" && process.env.DATABASE_URL.startsWith("file:"))) {
  // Preview fallback: no Postgres attached yet. Point Prisma at the SQLite
  // file seeded during the build. Read-only on serverless.
  const candidates = [
    path.join(process.cwd(), "prisma", "dev.db"),
    path.join(process.cwd(), "gtm-designer", "prisma", "dev.db"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) process.env.DATABASE_URL = `file:${found}`;
}

export { usesReadOnlySqlite } from "./database-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
