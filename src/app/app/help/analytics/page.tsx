import Link from "next/link";
import { Headline, Section, BackLink, Note } from "../_components/Stage";

export const metadata = { title: "Analytics · Help" };

export default function AnalyticsHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Reading the numbers · Analytics"
        title="Spread per pair, on your time scale."
        dek="The Analytics page rolls every matched leg into a per-pair spread report. Pick a window — day, week, month, or custom — and read the row that matters."
      />

      <Section eyebrow="The columns" title="">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile label="Pair"        body="Like USD/USDT or EUR/BTC. AccPanel infers the pair from the two legs of each trade row." />
          <Tile label="Volume"      body="Sum of the absolute amounts of the give-leg in the base currency of the pair." />
          <Tile label="Avg rate"    body="Volume-weighted average of the per-row exchange rate." />
          <Tile label="Spread"      body="Realised gain expressed as a percentage of the volume — your effective margin." />
          <Tile label="Trades"      body="Number of rows that contributed. Click to see them filtered in /app/transactions." last />
        </div>
      </Section>

      <Section eyebrow="Custom range" title="The picker is non-modal.">
        <p className="help-prose">
          The date range picker on the toolbar opens inline. Pick a start, pick
          an end, click outside — the page re-renders with the new bucket.
          URL state holds the range, so a bookmark is a saved view.
        </p>
      </Section>

      <Note>
        Refresh after a big import. Analytics is a server-side aggregation;
        it doesn&rsquo;t poll. The refresh button (top-right of the page) does
        a hard re-query without a full reload.
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

function Tile({ label, body, last }: { label: string; body: string; last?: boolean }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 px-5 py-4"
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
