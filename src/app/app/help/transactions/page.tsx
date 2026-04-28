import Link from "next/link";
import { Headline, Section, Steps, Note, BackLink, Stage } from "../_components/Stage";

export const metadata = { title: "Transactions · Help" };

export default function TransactionsHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Essentials · Transactions"
        title="One row, two legs, one truth."
        dek="A transaction always has at least two legs — what came in, and what went out. The list shows them stacked, with a thin rule between. This is the page you live in."
      />

      {/* ── Animated demo ──────────────────────────────────────────────── */}
      <Stage title="/app/transactions">
        <ManualTxScene />
      </Stage>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-4)" }}>
        Loop · adding a manual transaction
      </p>

      {/* ── Steps ──────────────────────────────────────────────────────── */}
      <Section eyebrow="How to add a transaction" title="Six taps from empty to saved">
        <Steps
          items={[
            {
              title: "Open the form",
              body: (
                <>
                  Press <strong>+ Add transaction</strong> at the top right of the
                  Transactions page. The inline form slides in above the list.
                </>
              ),
            },
            {
              title: "Pick a date",
              body: (
                <>
                  The form opens at <strong>today</strong> in your org timezone.
                  Backdate it if you&rsquo;re entering historical activity — the FIFO
                  engine reads timestamps strictly.
                </>
              ),
            },
            {
              title: "Choose a type",
              body: (
                <>
                  Type tags drive both filtering and how the row colours its
                  pill. The dropdown lists every type defined in{" "}
                  <Link href="/app/settings?tab=types" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>
                    Settings → Tx Types
                  </Link>
                  . Custom types are fine.
                </>
              ),
            },
            {
              title: "Fill the give-leg and the receive-leg",
              body: (
                <>
                  Each leg is amount + currency + (optional) wallet. Negative
                  amounts go on the left, positives on the right. A single-leg
                  movement (an inflow with no counter-leg) is allowed for
                  capital injections, not for trades.
                </>
              ),
            },
            {
              title: "Add a comment if it matters",
              body: (
                <>
                  Use the comment field for context that isn&rsquo;t a tx-hash —
                  &ldquo;agent paid in cash&rdquo;, &ldquo;refund from bot&rdquo;,
                  etc. It&rsquo;s searchable from the filter bar.
                </>
              ),
            },
            {
              title: "Save",
              body: (
                <>
                  The form fades out, the list scrolls and your row appears at
                  the top with a brief green flash. The audit log records who
                  created it and when.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ── Reading rows ───────────────────────────────────────────────── */}
      <Section eyebrow="Reading the table" title="Every row is annotated.">
        <div
          className="rounded-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}
        >
          <ReadingRow
            label="Type pill"
            body={
              <>
                Coloured by <code>transactionType</code>: green for revenue, red
                for expense, indigo for exchange, violet for fee. Grey means
                untyped. A pulsing amber dot is a <strong>review</strong> badge
                — an unmatched blockchain import that nobody has tagged yet.
              </>
            }
          />
          <ReadingRow
            label="Stacked legs"
            body={
              <>
                A row with two legs uses <strong>LegStack</strong>: a left rule
                groups them visually. Multi-currency trades show every leg in
                order of direction (out first, in second).
              </>
            }
          />
          <ReadingRow
            label="Exchange rate"
            body={
              <>
                Auto-derived. If the row has one fiat leg and one crypto leg,
                you&rsquo;ll see a <code>1.0123 USDT/USD</code> chip. It&rsquo;s
                read-only — to change it, edit one of the leg amounts.
              </>
            }
          />
          <ReadingRow
            label="Status"
            body={
              <>
                Most rows are <strong>Done</strong>. <strong>In&nbsp;process</strong>{" "}
                rows count toward projected balances on the dashboard but not
                actuals. <strong>Failed</strong> rows are excluded from FIFO.
              </>
            }
            last
          />
        </div>
      </Section>

      <Note>
        Inline edit is <strong>everywhere</strong>. Click an amount, a currency,
        a type, a wallet — the field flips into edit mode and saves on blur.
        Cmd / Ctrl + Z does <em>not</em> undo a save; the audit log is your
        only paper trail.
      </Note>

      <Section eyebrow="Filters" title="Find a row in two clicks.">
        <p className="help-prose">
          The bar at the top of the table has free-text search (<code>txHash</code>,
          location, comment, addresses, currency code), a type dropdown, and a{" "}
          <strong>Review</strong> toggle that surfaces every row still waiting
          for a tag. Filters serialise to the URL — bookmark a filter, share it
          with a teammate.
        </p>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/import",  title: "Importing data",  body: "Skip manual entry — pull from a wallet or paste CSV." },
            { href: "/app/help/clients", title: "Clients & KYC",   body: "Match a row to a person and unlock disposal reporting." },
            { href: "/app/help/fifo",    title: "FIFO & spread",   body: "What that 'realised gain' number actually means." },
          ]}
        />
      </Section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ReadingRow({
  label,
  body,
  last,
}: {
  label: string;
  body: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-6 px-5 py-4"
      style={last ? undefined : { borderBottom: "1px solid var(--inner-border)" }}
    >
      <p className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </p>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {body}
      </p>
    </div>
  );
}

function RelatedGrid({
  items,
}: {
  items: { href: string; title: string; body: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="group rounded-lg p-4 transition-colors"
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

/* ── The animated scene ───────────────────────────────────────────────── */

function ManualTxScene() {
  return (
    <div className="scene-tx-stage">
      {/* + Add transaction button */}
      <span className="scene-tx-toggle">+ Add transaction</span>

      {/* Existing list */}
      <div className="scene-tx-list" aria-hidden>
        {/* New row that materialises near the end of the loop */}
        <div className="scene-tx-row scene-tx-newrow">
          <code>27 Apr</code>
          <span>
            <span className="loss">−500.00 USD</span>{" "}
            <span style={{ color: "var(--text-4)" }}>→</span>{" "}
            <span className="gain">+498.50 USDT</span>
          </span>
          <span className="help-pill">Exchange</span>
        </div>
        <div className="scene-tx-row">
          <code>26 Apr</code>
          <span>
            <span className="loss">−1,200.00 EUR</span>{" "}
            <span style={{ color: "var(--text-4)" }}>→</span>{" "}
            <span className="gain">+1,290.40 USDT</span>
          </span>
          <span className="help-pill" style={{ background: "color-mix(in srgb, var(--indigo) 18%, transparent)", color: "var(--indigo)" }}>
            Exchange
          </span>
        </div>
        <div className="scene-tx-row">
          <code>26 Apr</code>
          <span>
            <span className="loss">−25.00 USDT</span>
          </span>
          <span className="help-pill" style={{ background: "color-mix(in srgb, var(--violet) 18%, transparent)", color: "var(--violet)" }}>
            Fee
          </span>
        </div>
        <div className="scene-tx-row">
          <code>25 Apr</code>
          <span>
            <span className="gain">+3,000.00 USDT</span>
          </span>
          <span className="help-pill" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>
            Revenue
          </span>
        </div>
      </div>

      {/* The form, slides in then out */}
      <div className="scene-tx-form" aria-hidden>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            New transaction
          </p>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
            esc to cancel
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date">
            <span className="scene-tx-fadefield f1">
              <span className="scene-tx-typed t1">27 Apr 2026</span>
              <span className="help-caret" />
            </span>
          </FormField>
          <FormField label="Type">
            <span className="scene-tx-fadefield f2">
              <span
                className="help-pill"
                style={{ background: "color-mix(in srgb, var(--indigo) 18%, transparent)", color: "var(--indigo)" }}
              >
                Exchange
              </span>
            </span>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="You give">
            <span className="scene-tx-fadefield f3" style={{ color: "var(--red)" }}>
              <span className="scene-tx-typed t2">−500.00</span>
              <span className="help-caret" />
              <span className="ml-1" style={{ color: "var(--text-3)" }}>USD</span>
            </span>
          </FormField>
          <FormField label="You receive">
            <span className="scene-tx-fadefield f4" style={{ color: "var(--accent)" }}>
              <span className="scene-tx-typed t3">+498.50</span>
              <span className="help-caret" />
              <span className="ml-1" style={{ color: "var(--text-3)" }}>USDT</span>
            </span>
          </FormField>
        </div>

        <button className="help-btn-primary scene-tx-savebtn" type="button">
          Save transaction
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
        {label}
      </span>
      <div
        className="flex items-center min-h-[34px] px-3 py-1.5 text-[12px]"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--inner-border)",
          borderRadius: 7,
          color: "var(--text-1)",
          fontFamily: "var(--font-ibm-plex-mono), ui-monospace, monospace",
        }}
      >
        {children}
      </div>
    </div>
  );
}
