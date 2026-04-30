import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { currencies } from "@/db/schema/wallets";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { runFifo, legsToFifoRows } from "@/lib/fifo/engine";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });

  const orgId = membership.organizationId;

  const fiatRows = await db.select({ code: currencies.code }).from(currencies)
    .where(and(eq(currencies.organizationId, orgId), eq(currencies.type, "fiat")));
  const fiatSet = new Set(fiatRows.map((r) => r.code));

  const txRows = await db
    .select({ id: transactions.id, timestamp: transactions.timestamp, transactionType: transactions.transactionType })
    .from(transactions)
    .where(and(eq(transactions.organizationId, orgId), eq(transactions.transactionType, "Exchange"), isNull(transactions.deletedAt)))
    .orderBy(transactions.timestamp);

  const legs = txRows.length > 0
    ? await db
        .select({ transactionId: transactionLegs.transactionId, direction: transactionLegs.direction, amount: transactionLegs.amount, currency: transactionLegs.currency, createdAt: transactionLegs.createdAt })
        .from(transactionLegs)
        .where(inArray(transactionLegs.transactionId, txRows.map((r) => r.id)))
        .orderBy(transactionLegs.createdAt, transactionLegs.id)
    : [];

  const legsByTx = new Map<string, typeof legs>();
  for (const leg of legs) {
    const arr = legsByTx.get(leg.transactionId) ?? [];
    arr.push(leg);
    legsByTx.set(leg.transactionId, arr);
  }

  const fifoRows = legsToFifoRows(txRows, legsByTx);
  const result = runFifo(fifoRows, fiatSet);

  // Flatten all disposals
  const allDisposals = Object.values(result.pairs).flatMap((pair) =>
    pair.disposals.map((d) => ({
      pair: pair.pair,
      currency: pair.assetCurrency,
      quoteCurrency: pair.baseCurrency,
      disposedAt: d.disposedAt.toISOString().replace("T", " ").slice(0, 19),
      lotAcquiredAt: d.lotAcquiredAt ? d.lotAcquiredAt.toISOString().replace("T", " ").slice(0, 19) : "",
      amount: d.amount.toFixed(8),
      proceedsRate: d.proceedsRate.toFixed(6),
      costRate: d.costRate.toFixed(6),
      proceeds: (d.amount * d.proceedsRate).toFixed(2),
      costBasis: (d.amount * d.costRate).toFixed(2),
      gain: d.gain.toFixed(2),
      gainCurrency: d.gainCurrency,
      txId: d.txId,
    }))
  ).sort((a, b) => a.disposedAt.localeCompare(b.disposedAt));

  const FIELDS = ["pair", "currency", "quoteCurrency", "disposedAt", "lotAcquiredAt", "amount", "proceedsRate", "costRate", "proceeds", "costBasis", "gain", "gainCurrency", "txId"];
  const bom = "\uFEFF";
  const header = FIELDS.join(",");
  const csvRows = allDisposals.map((d) =>
    FIELDS.map((f) => String((d as Record<string, string>)[f] ?? "")).join(",")
  );
  const csv = bom + header + "\n" + csvRows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="realized-gains-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
