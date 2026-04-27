import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { userLockSettings } from "@/db/schema/system";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface MatrixKeyData {
  secretNumber: number;
  secretCell: { x: number; y: number };
  pattern: number[][];
}

interface LockSettingsBody {
  pinHash?: string | null;
  matrixKey?: MatrixKeyData | null;
  autolockMinutes?: number;
  theme?: string | null;
}

async function requireUserId(): Promise<string | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return user.id;
}

export async function GET() {
  const userIdOrResp = await requireUserId();
  if (typeof userIdOrResp !== "string") return userIdOrResp;
  const userId = userIdOrResp;

  const [row] = await db.select().from(userLockSettings)
    .where(eq(userLockSettings.userId, userId)).limit(1);

  return NextResponse.json({
    pinHash: row?.pinHash ?? null,
    matrixKey: row?.matrixKey ?? null,
    autolockMinutes: row?.autolockMinutes ?? 0,
    theme: row?.theme ?? null,
  });
}

export async function PUT(req: Request) {
  const userIdOrResp = await requireUserId();
  if (typeof userIdOrResp !== "string") return userIdOrResp;
  const userId = userIdOrResp;

  let body: LockSettingsBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const patch: Partial<typeof userLockSettings.$inferInsert> = { updatedAt: new Date() };
  if ("pinHash"         in body) patch.pinHash         = body.pinHash ?? null;
  if ("matrixKey"       in body) patch.matrixKey       = body.matrixKey ?? null;
  if ("autolockMinutes" in body) patch.autolockMinutes = Math.max(0, Math.floor(body.autolockMinutes ?? 0));
  if ("theme"           in body) patch.theme           = body.theme ?? null;

  await db.insert(userLockSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userLockSettings.userId, set: patch });

  return NextResponse.json({ ok: true });
}
