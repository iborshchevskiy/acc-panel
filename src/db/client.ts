import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Used for Drizzle queries (server-side only)
const connectionString = process.env.DATABASE_URL!;

// Disable prefetch for serverless environments
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
