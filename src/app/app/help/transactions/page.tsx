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

      {/* ── Split into parts ─────────────────────────────────────────────── */}
      <Section eyebrow="Splitting one row into many" title="When one transfer covers two stories.">
        <p className="help-prose">
          A single on-chain payment can sometimes be two unrelated bookings —
          half is an Exchange with one client, the other half is a Debt with
          another. Open the row in <strong>edit</strong> mode and click{" "}
          <strong>Split into parts</strong>. The form replaces the leg editor
          with N equal-sized child blanks and a <em>remaining</em> indicator
          for every direction × currency.
        </p>
        <p className="help-prose">
          Distribute the legs across parts however you like — different types,
          different clients, different statuses, different comments. The
          Apply button stays disabled until each (direction, currency) sums
          back to the original within rounding. The split is atomic: the
          parent row is soft-deleted, the children appear in its place, and
          the audit log records the lineage so you can rebuild the original
          if needed.
        </p>
        <p className="help-prose">
          European decimal formats are accepted in the part fields — type{" "}
          <code>1.234,56</code> or <code>1,234.56</code> or{" "}
          <code>1 234,56</code> and the parser treats the last separator as
          the decimal point.
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

/* ── The animated scene — recreates the real Transactions page UI ────── */

function ManualTxScene() {
  return (
    <div className="scene-tx-stage">
      {/* Page chrome — header, filters, table — rendered exactly like the
          real /app/transactions page so the demo feels like the product. */}
      <div className="scene-tx-tablewrap">
        <div className="scene-tx-head">
          <div>
            <div className="title">Transactions</div>
            <div className="sub">128 total</div>
          </div>
          <span className="scene-tx-newbtn">+ New</span>
        </div>

        <div className="scene-tx-filter">
          <span className="scene-tx-search" style={{ color: "var(--text-4)" }}>
            Search TxID, address, currency, comment…
          </span>
          <span className="scene-tx-typechip">Exchange</span>
          <span className="scene-tx-typechip">Revenue</span>
          <span className="scene-tx-typechip">Fee</span>
        </div>

        <div className="scene-tx-thead">
          <span>Date</span><span>Type</span><span>Status</span>
          <span>In</span><span>Out</span><span>Rate</span><span>Client</span>
        </div>

        <div className="scene-tx-list" aria-hidden>
          {/* New row that lands at the end of the loop */}
          <div className="scene-tx-row scene-tx-newrow">
            <div>
              <div className="date">2026-04-28 11:32</div>
              <div className="id">a4f2d1c7</div>
            </div>
            <span className="real-pill real-pill-exchange">Exchange</span>
            <span className="real-status done"><span className="dot" />Done</span>
            <span className="gain">+498.50 USDT</span>
            <span className="loss">−500.00 USD</span>
            <span className="rate">1.0030</span>
            <span className="real-client-chip">
              <span className="av">A</span>Anna K.
            </span>
          </div>

          {/* Existing rows — these stay visible the whole loop */}
          <div className="scene-tx-row">
            <div>
              <div className="date">2026-04-27 16:09</div>
              <div className="id">f1e8b22a</div>
            </div>
            <span className="real-pill real-pill-exchange">Exchange</span>
            <span className="real-status done"><span className="dot" />Done</span>
            <span className="gain">+1,290.40 USDT</span>
            <span className="loss">−1,200.00 EUR</span>
            <span className="rate">1.0753</span>
            <span className="real-client-chip">
              <span className="av">P</span>Pavel L.
            </span>
          </div>

          <div className="scene-tx-row">
            <div>
              <div className="date">2026-04-27 14:51</div>
              <div className="id">5b2c9e4d</div>
            </div>
            <span className="real-pill real-pill-fee">Fee</span>
            <span className="real-status done"><span className="dot" />Done</span>
            <span style={{ color: "var(--text-4)" }}>—</span>
            <span className="loss">−25.00 USDT</span>
            <span className="rate">—</span>
            <span className="real-client-placeholder">+ client</span>
          </div>

          <div className="scene-tx-row">
            <div>
              <div className="date">2026-04-27 09:14</div>
              <div className="id">2a44ff19</div>
            </div>
            <span className="real-pill real-pill-revenue">Revenue</span>
            <span className="real-status in_process"><span className="dot" />In process</span>
            <span className="gain">+3,000.00 USDT</span>
            <span style={{ color: "var(--text-4)" }}>—</span>
            <span className="rate">—</span>
            <span className="real-client-chip">
              <span className="av">M</span>Marko D.
            </span>
          </div>
        </div>
      </div>

      {/* Manual transaction form — slides in over the table when "+ New" pulses */}
      <div className="scene-tx-form" aria-hidden>
        <div className="eyebrow">New transaction</div>

        {/* Meta row: Date / Type / Status / Comment */}
        <div className="meta">
          <div className="col">
            <span className="label">Date &amp; time</span>
            <span className="val">
              <span className="scene-tx-fade f1">
                <span className="scene-tx-typed t1">2026-04-28 11:32</span>
                <span className="help-caret" />
              </span>
            </span>
          </div>
          <div className="col">
            <span className="label">Type</span>
            <span className="val">
              <span className="scene-tx-fade f2">
                <span className="real-pill real-pill-exchange">Exchange</span>
              </span>
            </span>
          </div>
          <div className="col">
            <span className="label">Status</span>
            <span className="val">
              <span className="scene-tx-fade f3">
                <span className="real-status done"><span className="dot" />Done</span>
              </span>
            </span>
          </div>
          <div className="col">
            <span className="label">Comment</span>
            <span className="val" style={{ color: "var(--text-4)" }}>—</span>
          </div>
        </div>

        {/* Legs — Income | Swap | Outcome */}
        <div className="scene-tx-legs">
          <div>
            <div className="col-label income">Income</div>
            <div className="leg">
              <span className="amount" style={{ color: "var(--accent)" }}>
                <span className="scene-tx-fade f4">
                  <span className="scene-tx-typed t2">+498.50</span>
                  <span className="help-caret" />
                </span>
              </span>
              <span className="ccy">
                <span className="scene-tx-fade f5">USDT</span>
              </span>
            </div>
          </div>
          <div className="swap" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <path d="M2 4.5h10M10 2l2.5 2.5L10 7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 10.5H3M5 8l-2.5 2.5L5 13" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="col-label outcome">Outcome</div>
            <div className="leg">
              <span className="amount" style={{ color: "var(--red)" }}>
                <span className="scene-tx-fade f4">
                  <span className="scene-tx-typed t3">−500.00</span>
                  <span className="help-caret" />
                </span>
              </span>
              <span className="ccy">
                <span className="scene-tx-fade f5">USD</span>
              </span>
            </div>
          </div>
        </div>

        <div className="scene-tx-savewrap">
          <span className="scene-tx-savebtn">Add transaction</span>
          <span className="scene-tx-fade f6" style={{ fontSize: 11, color: "var(--text-3)" }}>Cancel</span>
        </div>
      </div>
    </div>
  );
}
