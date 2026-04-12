import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Use direct connection for migrations (pooler doesn't support DDL)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
