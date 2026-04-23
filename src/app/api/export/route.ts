import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, desc, isNull, and } from "drizzle-orm";

const FIELDNAMES = ["Date","Type","Transaction Type","Income Amount","Income Currency","Outcome Amount","Outcome Currency","Fee","Fee Currency","TxID","From","To","Comment","Location"];

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });

  const txRows = await db.select().from(transactions)
    .where(and(eq(transactions.organizationId, membership.organizationId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.timestamp));

  const legs = await db.select().from(transactionLegs)
    .innerJoin(transactions, eq(transactions.id, transactionLegs.transactionId))
    .where(and(eq(transactions.organizationId, membership.organizationId), isNull(transactions.deletedAt)));

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transaction_legs.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transaction_legs.transactionId, arr);
  }

  const rows = txRows.map((tx) => {
    const txLegs = legsByTx.get(tx.id) ?? [];
    const inLeg = txLegs.find((l) => l.transaction_legs.direction === "in");
    const outLeg = txLegs.find((l) => l.transaction_legs.direction === "out");
    const feeLeg = txLegs.find((l) => l.transaction_legs.direction === "fee");
    return {
      "Date": new Date(tx.timestamp).toISOString().replace("T", " ").slice(0, 19),
      "Type": tx.type,
      "Transaction Type": tx.transactionType ?? "",
      "Income Amount": inLeg ? inLeg.transaction_legs.amount : "",
      "Income Currency": inLeg ? inLeg.transaction_legs.currency : "",
      "Outcome Amount": outLeg ? outLeg.transaction_legs.amount : "",
      "Outcome Currency": outLeg ? outLeg.transaction_legs.currency : "",
      "Fee": feeLeg ? feeLeg.transaction_legs.amount : "",
      "Fee Currency": feeLeg ? feeLeg.transaction_legs.currency : "",
      "TxID": tx.txHash ?? "",
      "From": tx.fromAddress ? `https://tronscan.org/#/address/${tx.fromAddress}` : "",
      "To": tx.toAddress ? `https://tronscan.org/#/address/${tx.toAddress}` : "",
      "Comment": tx.comment ?? "",
      "Location": tx.location ?? "",
    };
  });

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="accpanel-export-${Date.now()}.json"`,
      },
    });
  }

  // CSV with BOM (v1-compatible)
  const bom = "\uFEFF";
  const header = FIELDNAMES.join(";");
  const csvRows = rows.map((r) =>
    FIELDNAMES.map((f) => String((r as Record<string, string | null>)[f] ?? "").replace(/;/g, ",")).join(";")
  );
  const csv = bom + header + "\n" + csvRows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="accpanel-export-${Date.now()}.csv"`,
    },
  });
}
