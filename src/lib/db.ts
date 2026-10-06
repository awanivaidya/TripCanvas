// One shared Prisma client for the whole app.
//
// Why the globalThis trick? In development, Next.js reloads our code every time we save a
// file. Without this, each reload would create a *new* PrismaClient with its own database
// connections, and we'd soon run out of connections. Storing it on globalThis (which
// survives reloads) means we reuse the same client.
//
// Why the Neon adapter? Postgres normally talks on port 5432, and some networks (campus Wi-Fi)
// block that port: every query then failed with "Timed out fetching a new connection from the
// connection pool". The adapter sends the same queries to Neon over a WebSocket on port 443, the
// HTTPS port, which networks leave open. Our code doesn't change: it's still `db.trip.create(...)`.
// (The Prisma CLI, e.g. `npx prisma migrate dev`, doesn't use this file: it still needs port 5432.)
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
