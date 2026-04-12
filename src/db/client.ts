import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// In production use the pooler (port 6543, transaction mode) to avoid
// exhausting the direct connection limit across Vercel serverless instances.
// In development use the direct connection (port 5432) so Drizzle push / DDL works.
const connectionString =
  process.env.NODE_ENV === "production" && process.env.DATABASE_POOLER_URL
    ? process.env.DATABASE_POOLER_URL
    : process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  prepare: false,
  max: process.env.NODE_ENV === "production" ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
