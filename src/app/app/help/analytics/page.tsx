import Link from "next/link";
import { Headline, Section, BackLink, Note } from "../_components/Stage";

export const metadata = { title: "Analytics · Help" };

export default function AnalyticsHelpPage() {
  return (
    <div className="mx-auto max-w-[820px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Reading the numbers · Analytics"
        title="A profit-and-loss report, with infographics."
        dek="Analytics rolls every Exchange and Revenue row into a single page laid out like a financial-analyst report — KPIs at the top, time-series charts in the middle, a P&L table by period, and an activity heatmap at the bottom."
      />

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <Section eyebrow="The four headline numbers" title="Realized Gain · Revenue · Trades · Volume">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile
            label="Realized Gain"
            body={
              <>
                The FIFO engine&rsquo;s output, summed in USDT. This is the
                spread you actually kept — proceeds minus cost basis on every
                disposal in the active window. Green if positive, red if
                negative. The subtitle counts the disposals that contributed.
              </>
            }
          />
          <Tile
            label="Revenue"
            body={
              <>
                Total of every <strong>Revenue</strong>-typed transaction&rsquo;s
                income leg, expressed in USDT-equivalent. Income that&rsquo;s
                not from trading — fees you charged, side income, etc. The
                subtitle shows which currencies it&rsquo;s coming from.
              </>
            }
          />
          <Tile
            label="Exchange Trades"
            body={
              <>
                Count of distinct Exchange transactions in scope.
                Multi-leg trades count once, not per leg. The arrow shows
                month-over-month change against the previous bucket.
              </>
            }
          />
          <Tile
            label="Total Volume"
            body={
              <>
                Sum of every Exchange leg amount, converted to USDT using the
                org&rsquo;s own historical buy/sell midpoint per pair. A
                currency without a USDT pair in your history (e.g. RUB if
                you&rsquo;ve never quoted it) is excluded and listed in the
                subtitle.
              </>
            }
            last
          />
        </div>
      </Section>

      <Note>
        The headline numbers respect the active range. Switch to{" "}
        <strong>custom</strong>, pick a window, every number on the page —
        Gain, Revenue, Volume, the heatmap — recomputes. Bookmark a
        custom-range URL and you&rsquo;ve saved a view.
      </Note>

      {/* ── Income breakdown panel ────────────────────────────────────────── */}
      <Section eyebrow="Income Breakdown" title="Realized + Revenue = Total Income">
        <p className="help-prose">
          The panel directly under the KPI strip splits income into the two
          sources that an exchange office actually has — <strong>realised
          FIFO gain</strong> on trades, plus <strong>Revenue-typed</strong>{" "}
          activity. The third card sums them. If any of your gain settles in
          a non-USDT base currency (rare — happens with USDC pairs) it surfaces
          on a second row underneath.
        </p>
      </Section>

      {/* ── Volume timeline ───────────────────────────────────────────────── */}
      <Section eyebrow="Volume Timeline" title="Always daily, always last 60 days.">
        <p className="help-prose">
          Three small-multiples charts — one per top currency — showing daily
          volume as a line over an area gradient. The bucket selector at the
          top of the page (day/week/month) only controls the period table
          below; the timeline stays at daily resolution so spikes don&rsquo;t
          smooth out. Days with no activity render as zero, not a gap, so the
          line shape is the truth.
        </p>
        <p className="help-prose">
          Each card shows the period total and the peak day. Below the native
          number, an <code>≈ N USDT</code> hint applies the same conversion
          as the headline so you can compare currencies at a glance.
        </p>
      </Section>

      {/* ── Currency mix + pair margin ────────────────────────────────────── */}
      <Section eyebrow="Currency Mix · Pair Margin" title="Volume share, then per-pair spread.">
        <p className="help-prose">
          The two cards side-by-side under the timeline: <strong>Currency
          Mix</strong> is a horizontal bar chart of raw volume share — what
          fraction of your total flow each currency represents. <strong>Pair
          Margin</strong> shows buy → sell VWAP for each pair plus a centred
          bar of the margin %, normalised to the largest absolute margin in
          view. Bar leaning right is a positive spread (you bought cheap, sold
          dear); bar leaning left is a loss on that pair.
        </p>
        <p className="help-prose">
          Multi-leg Exchange transactions (e.g. you paid USDT for EUR + CZK
          in one transfer) are <em>excluded</em> from the spread analysis —
          their per-side rate is ambiguous and belongs to FIFO&rsquo;s domain,
          not the spread report.
        </p>
      </Section>

      {/* ── Period breakdown ─────────────────────────────────────────────── */}
      <Section eyebrow="Period Breakdown" title="The income statement, by bucket.">
        <p className="help-prose">
          A row per <strong>day / week / month</strong> (your choice) with:
        </p>
        <div className="mt-2 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile label="Trades"   body="Distinct Exchange transactions in the bucket." />
          <Tile label="Gain"     body="Realised FIFO gain in USDT for this bucket only." />
          <Tile label="Revenue"  body="Revenue-typed income in USDT-equivalent." />
          <Tile label="Net CCY"  body="Net flow per top currency — positive means received, negative means paid." />
          <Tile label="Volume"   body="Sparkline-style bar normalised to the busiest bucket, with the raw number alongside." last />
        </div>
        <p className="help-prose mt-3">
          The footer totals match the KPI strip exactly. If they don&rsquo;t,
          something in your filter window is off — likely a soft-deleted row
          that snuck back in.
        </p>
      </Section>

      {/* ── Activity heatmap ─────────────────────────────────────────────── */}
      <Section eyebrow="Activity Heatmap" title="Day-of-week × hour, in your timezone.">
        <p className="help-prose">
          7×24 grid — one cell per (day, hour). Cell colour is trade count
          on that slot, scaled to the busiest cell. Time is bucketed in{" "}
          <strong>Europe/Prague</strong>, not UTC, so a trade at 14:00 local
          shows on the 14:00 column even if the underlying timestamp is 12:00 UTC.
          The legend below the grid runs from <em>quiet</em> to <em>busy</em>;
          hover any cell for the exact count.
        </p>
      </Section>

      {/* ── Refresh ──────────────────────────────────────────────────────── */}
      <Note>
        Refresh after a big import. Analytics is a server-side aggregation —
        it doesn&rsquo;t poll. The button top-right re-queries without a full
        page reload.
      </Note>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/fifo",         title: "FIFO",         body: "How realised gain is computed at the lot level." },
            { href: "/app/help/dashboard",    title: "Dashboard",    body: "The 60-second view of net positions." },
            { href: "/app/help/transactions", title: "Transactions", body: "Drill in from any analytics row." },
          ]}
        />
      </Section>
    </div>
  );
}

function Tile({ label, body, last }: { label: string; body: React.ReactNode; last?: boolean }) {
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
