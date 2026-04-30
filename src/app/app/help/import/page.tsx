import Link from "next/link";
import { Headline, Section, Steps, Note, BackLink, Stage } from "../_components/Stage";

export const metadata = { title: "Importing data · Help" };

export default function ImportHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Essentials · Import"
        title="Bring history in. Keep it fresh."
        dek="Three lanes: paste a CSV, run a one-shot blockchain pull from a wallet, or set the cron to keep every wallet in sync. Pick one — they all land in the same Transactions table."
      />

      <Stage title="/app/data · CSV import">
        <CsvScene />
      </Stage>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-4)" }}>
        Loop · drop file, parse, save
      </p>

      {/* ── CSV ────────────────────────────────────────────────────────── */}
      <Section eyebrow="CSV import" title="When the data lives in a spreadsheet.">
        <Steps
          items={[
            {
              title: "Open the Data Hub",
              body: (
                <>
                  Sidebar → <Link href="/app/data" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Data</Link>.
                  CSV import lives in the first card.
                </>
              ),
            },
            {
              title: "Drop a file",
              body: (
                <>
                  The dropzone accepts a single <code>.csv</code>. Semicolon and
                  comma delimiters are both detected. Headers must match the
                  expected schema — the importer prints a clear error if a
                  column is missing.
                </>
              ),
            },
            {
              title: "Review the preview",
              body: (
                <>
                  AccPanel shows the first 25 rows and the row count. If types
                  look wrong, fix the header in the CSV and try again — partial
                  imports are not allowed.
                </>
              ),
            },
            {
              title: "Confirm",
              body: (
                <>
                  Rows land in Transactions in one batch. Each row gets the
                  source <code>csv:[filename]</code> in its <code>location</code>{" "}
                  field so you can find them later with the search bar.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ── Chain import ───────────────────────────────────────────────── */}
      <Section eyebrow="Blockchain pull" title="One wallet, everything it ever did.">
        <p className="help-prose">
          On <Link href="/app/wallets" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Wallets</Link>{" "}
          the <strong>Import</strong> button runs the chain-specific importer.
          AccPanel ships with three: <code>tron.ts</code>, <code>evm.ts</code>{" "}
          (Ethereum + BNB Chain), and <code>sol.ts</code>. Each fetches every
          confirmed transaction, deduplicates against existing rows, and
          writes legs in the correct direction.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ChainCard label="TRON" body="TRC-20 + native TRX. Reads from public RPC." color="var(--red)" />
          <ChainCard label="Ethereum / BNB" body="ERC-20 + native ETH/BNB. Etherscan-style API." color="var(--indigo)" />
          <ChainCard label="Solana" body="SPL tokens + SOL. Solscan-style API." color="var(--accent)" />
        </div>
      </Section>

      {/* ── Cron ───────────────────────────────────────────────────────── */}
      <Section eyebrow="Auto-import (cron)" title="Hourly without you doing anything.">
        <p className="help-prose">
          Toggle <strong>Auto-import</strong> on a wallet row. The cron at{" "}
          <code>/api/cron/import</code> picks up every flagged wallet on its
          next tick and runs each importer in sequence. The hourly trigger is
          configured in <code>vercel.json</code>; on production a{" "}
          <code>CRON_SECRET</code> guards the endpoint.
        </p>
        <Note>
          On a dev box the cron route accepts <code>?force=1</code> to bypass
          the secret. The endpoint also returns a small JSON diagnostic block
          you can paste into a chat when something looks wrong.
        </Note>
      </Section>

      {/* ── Provider keys + error states ─────────────────────────────────── */}
      <Section eyebrow="When import fails" title="The error is right next to the button.">
        <p className="help-prose">
          Every chain needs a provider key in env: <code>TRONGRID_API_KEY</code>,{" "}
          <code>ETHERSCAN_API_KEY</code>, <code>BSCSCAN_API_KEY</code>, or{" "}
          <code>HELIUS_API_KEY</code>. If a key is missing or invalid, the{" "}
          <strong>Import</strong> button shows a one-line reason inline (not
          just &ldquo;Error&rdquo;) — admin must set the key in Vercel and
          redeploy. The raw error sits in the <code>title</code> attribute for
          power users.
        </p>
      </Section>

      {/* ── Decimal-format tolerance ─────────────────────────────────────── */}
      <Section eyebrow="CSV decimal formats" title="Paste European spreadsheets without surgery.">
        <p className="help-prose">
          The CSV importer accepts every common decimal format an exchange
          operator might paste:
        </p>
        <ul className="mt-2 space-y-1 list-none pl-0">
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1234.56</span> — US/UK plain
          </li>
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1234,56</span> — EU plain
          </li>
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1,234.56</span> — US thousand-separator
          </li>
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1.234,56</span> — DE/CZ thousand-separator
          </li>
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1 234,56</span> — FR space-separator
          </li>
          <li className="text-[13px] font-mono" style={{ color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-4)" }}>1&apos;234.56</span> — Swiss apostrophe
          </li>
        </ul>
        <p className="help-prose mt-3">
          When both <code>,</code> and <code>.</code> appear, the last one is
          treated as the decimal separator. Rows that fail to parse are
          counted as errors and skipped instead of corrupting the DB.
        </p>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/wallets",      title: "Wallets",       body: "Where the auto-import toggle lives." },
            { href: "/app/help/transactions", title: "Transactions",  body: "Where imported rows show up — and how to fix them." },
            { href: "/app/help/security",     title: "Security",      body: "Audit log records every import event." },
          ]}
        />
      </Section>
    </div>
  );
}

function ChainCard({ label, body, color }: { label: string; body: string; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>{label}</p>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        {body}
      </p>
    </div>
  );
}

function RelatedGrid({ items }: { items: { href: string; title: string; body: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="rounded-lg p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {it.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            {it.body}
          </p>
        </Link>
      ))}
    </div>
  );
}

/* ── Animated CSV scene ───────────────────────────────────────────────── */

function CsvScene() {
  return (
    <div className="scene-csv-stage">
      {/* Recreates the real /app/data CSV importer: file picker label,
          Import button, success result chip. */}
      <div className="scene-csv-form">
        <span className="scene-csv-choose">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 9V1M4 4l3-3 3 3M2 11h10"
              stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <span className="scene-csv-filename">kraken_export.csv</span>
            <span className="help-caret" />
          </span>
        </span>
        <span className="scene-csv-import">
          <span className="label-import">Import</span>
        </span>
      </div>

      <div className="scene-csv-result">
        <span className="ok">✓ Import complete</span>
        <span className="meta">1,247 inserted · 12 skipped · 0 errors</span>
      </div>

      <p className="scene-csv-hint">
        Accepts v1-compatible semicolon CSV or JSON. Existing TxIDs are skipped (idempotent).
      </p>
    </div>
  );
}
