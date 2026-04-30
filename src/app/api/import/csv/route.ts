import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { transactions, transactionLegs } from "@/db/schema/transactions";
import { organizationMembers } from "@/db/schema/system";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { ensureCurrencies } from "@/lib/currencies";
import { isRateLimited } from "@/lib/rate-limit";
import { parseAmountToString } from "@/lib/parse-amount";

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

/** Infer blockchain from TxID format. Returns null for manual/unknown entries. */
function inferChain(txHash: string | null): string | null {
  if (!txHash) return null;
  if (txHash.startsWith("0x") && txHash.length === 66) return "ETH"; // EVM (ETH/BNB)
  if (/^[0-9a-fA-F]{64}$/.test(txHash)) return "TRON";              // TRON tx hash
  if (txHash.length >= 87 && txHash.length <= 90) return "SOL";      // Solana signature
  return null;
}

/** Fingerprint for deduplicating no-TxID rows: timestamp + income side */
function rowFingerprint(row: CsvRow): string {
  const ts = new Date(row.Date).toISOString().slice(0, 19);
  return `${ts}|${(row["Income Currency"] || "").toUpperCase()}|${row["Income Amount"] || ""}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [membership] = await db.select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 });
  const orgId = membership.organizationId;

  if (isRateLimited(`csv-import:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  let rows: CsvRow[];
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 413 });
    }

    const isJson = file.name.endsWith(".json") || file.type === "application/json";
    const isCsv = file.name.endsWith(".csv") || file.type === "text/csv" || file.type === "text/plain";
    if (!isJson && !isCsv) {
      return NextResponse.json({ error: "Invalid file type. Only .csv and .json are accepted." }, { status: 415 });
    }

    const text = await file.text();
    rows = isJson ? (JSON.parse(text) as CsvRow[]) : parseCsv(text);
  } catch (e) {
    return NextResponse.json({ error: "Failed to parse file", message: String(e) }, { status: 400 });
  }

  // ── Validate rows ───────────────────────────────────────────────────────────
  let errors = 0;
  const validRows: CsvRow[] = [];
  for (const row of rows) {
    const ts = new Date(row.Date);
    if (isNaN(ts.getTime())) { errors++; continue; }
    validRows.push(row);
  }

  // ── Batch dedup — 2 queries total regardless of file size ──────────────────

  // 1. TxID rows: one IN query for all hashes. Filter `deleted_at IS NULL`
  // so soft-deleted rows don't block re-import (audit memory rule).
  const rowsWithHash = validRows.filter((r) => r.TxID);
  const existingHashes = new Set<string>();
  if (rowsWithHash.length > 0) {
    const found = await db
      .select({ txHash: transactions.txHash })
      .from(transactions)
      .where(and(
        eq(transactions.organizationId, orgId),
        inArray(transactions.txHash, rowsWithHash.map((r) => r.TxID)),
        isNull(transactions.deletedAt),
      ));
    found.forEach((r) => r.txHash && existingHashes.add(r.txHash));
  }

  // 2. No-TxID rows: fetch existing fingerprints (timestamp + income side) in one JOIN query
  const rowsNoHash = validRows.filter((r) => !r.TxID);
  const existingFingerprints = new Set<string>();
  if (rowsNoHash.length > 0) {
    const fingerprintRows = await db.execute(sql`
      SELECT to_char(t.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS ts,
             tl.currency, tl.amount::text AS amount
      FROM ${transactions} t
      JOIN ${transactionLegs} tl ON tl.transaction_id = t.id AND tl.direction = 'in'
      WHERE t.organization_id = ${orgId}
        AND t.tx_hash IS NULL
        AND t.deleted_at IS NULL
    `) as unknown as Array<{ ts: string; currency: string; amount: string }>;
    fingerprintRows.forEach((r) => {
      existingFingerprints.add(`${r.ts.slice(0, 19)}|${(r.currency ?? "").toUpperCase()}|${r.amount ?? ""}`);
    });
  }

  // ── Filter to new rows only ─────────────────────────────────────────────────
  const newRows = validRows.filter((row) => {
    if (row.TxID) return !existingHashes.has(row.TxID);
    return !existingFingerprints.has(rowFingerprint(row));
  });

  const skipped = validRows.length - newRows.length;

  if (newRows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, errors });
  }

  // ── Build leg payloads up front so we can validate amounts and reject
  // unparseable rows before touching the DB. parseAmountToString handles
  // every common decimal format (US, EU, FR, CH) so a German user pasting
  // "1.234,56" doesn't blow the import.
  type LegBuild = { direction: "in" | "out" | "fee"; amount: string; currency: string };
  const legsByRow: LegBuild[][] = [];
  const validatedRows: CsvRow[] = [];
  for (const row of newRows) {
    const legs: LegBuild[] = [];
    let rowOk = true;
    const tryAdd = (raw: string, currency: string, direction: "in" | "out" | "fee") => {
      if (!raw || !currency) return;
      const amt = parseAmountToString(raw);
      if (amt == null) { rowOk = false; return; }
      legs.push({ direction, amount: amt, currency });
    };
    tryAdd(row["Income Amount"], row["Income Currency"], "in");
    tryAdd(row["Outcome Amount"], row["Outcome Currency"], "out");
    tryAdd(row["Fee"], row["Fee Currency"], "fee");
    if (!rowOk) { errors++; continue; }
    validatedRows.push(row);
    legsByRow.push(legs);
  }

  if (validatedRows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, errors });
  }

  // ── Insert in a transaction so a leg-insert failure rolls the tx-insert
  // back. Without this, a partial failure left orphan txs (audit Bug B9).
  let inserted = 0;
  try {
    await db.transaction(async (tx) => {
      const insertedTxs = await tx.insert(transactions).values(
        validatedRows.map((row) => ({
          organizationId: orgId,
          txHash: row.TxID || null,
          chain: inferChain(row.TxID || null),
          type: row.Type || "Trade",
          transactionType: row["Transaction Type"] || null,
          timestamp: new Date(row.Date),
          fromAddress: row.From ? extractAddress(row.From) : null,
          toAddress: row.To ? extractAddress(row.To) : null,
          location: row.Location || null,
          comment: row.Comment || null,
          isMatched: false,
          raw: row as unknown as Record<string, string>,
        }))
      ).returning({ id: transactions.id });

      const allLegs: Array<LegBuild & { transactionId: string }> = [];
      for (let i = 0; i < validatedRows.length; i++) {
        for (const leg of legsByRow[i]) {
          allLegs.push({ transactionId: insertedTxs[i].id, ...leg });
        }
      }
      if (allLegs.length > 0) await tx.insert(transactionLegs).values(allLegs);
      inserted = insertedTxs.length;
    });

    const allCurrencies = legsByRow.flat().map((l) => l.currency);
    if (allCurrencies.length > 0) await ensureCurrencies(orgId, allCurrencies);
  } catch (e) {
    return NextResponse.json({
      error: "Insert failed",
      message: e instanceof Error ? e.message : String(e),
      inserted: 0, skipped, errors: errors + validatedRows.length,
    }, { status: 500 });
  }

  return NextResponse.json({ inserted, skipped, errors });
}
