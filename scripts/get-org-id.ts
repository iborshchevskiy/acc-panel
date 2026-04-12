import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { organizations } from "../src/db/schema/system";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  console.log(JSON.stringify(orgs, null, 2));
  await client.end();
}
main().catch(console.error);
