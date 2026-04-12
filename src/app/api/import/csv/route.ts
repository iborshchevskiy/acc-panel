import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";

interface CsvRow {
  Date: string;
  Type: string;
  "Transaction Type": string;
  "Income Amount": string;
  "Income Currency": string;
  "Outcome Amount": string;
  "Outcome Currency": string;
  Fee: string;
  "Fee Currency": string;
  TxID: string;
  From: string;
  To: string;
  Comment: string;
  Location: string;
}

function parseCsv(raw: string): CsvRow[] {
  const clean = raw.replace(/^\uFEFF/, "");
  const lines = clean.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row as unknown as CsvRow;
  });
}

function extractAddress(urlOrAddr: string): string {
  const m = urlOrAddr.match(/\/address\/([^/]+)$/);
  return m ? m[1] : urlOrAddr;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });
  const orgId = membership.organizationId;

  let rows: CsvRow[];
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const text = await file.text();

    if (file.name.endsWith(".json")) {
      rows = JSON.parse(text) as CsvRow[];
    } else {
      rows = parseCsv(text);
    }
  } catch (e) {
    return NextResponse.json({ error: "Failed to parse file", message: String(e) }, { status: 400 });
  }

  let inserted = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    try {
      const txHash = row.TxID || null;

      if (txHash) {
        const existing = await db.select({ id: transactions.id }).from(transactions)
          .where(and(eq(transactions.txHash, txHash), eq(transactions.organizationId, orgId))).limit(1);
        if (existing.length > 0) { skipped++; continue; }
      }

      const fromAddr = row.From ? extractAddress(row.From) : null;
      const toAddr = row.To ? extractAddress(row.To) : null;

      const [tx] = await db.insert(transactions).values({
        organizationId: orgId,
        txHash,
        chain: "TRON",
        type: row.Type || "Trade",
        transactionType: row["Transaction Type"] || null,
        timestamp: new Date(row.Date),
        fromAddress: fromAddr,
        toAddress: toAddr,
        location: row.Location || null,
        comment: row.Comment || null,
        isMatched: false,
        raw: row as unknown as Record<string, string>,
      }).returning({ id: transactions.id });

      if (row["Income Amount"] && row["Income Currency"]) {
        await db.insert(transactionLegs).values({ transactionId: tx.id, direction: "in", amount: row["Income Amount"], currency: row["Income Currency"] });
      }
      if (row["Outcome Amount"] && row["Outcome Currency"]) {
        await db.insert(transactionLegs).values({ transactionId: tx.id, direction: "out", amount: row["Outcome Amount"], currency: row["Outcome Currency"] });
      }
      if (row["Fee"] && row["Fee Currency"]) {
        await db.insert(transactionLegs).values({ transactionId: tx.id, direction: "fee", amount: row["Fee"], currency: row["Fee Currency"] });
      }

      inserted++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ inserted, skipped, errors });
}
