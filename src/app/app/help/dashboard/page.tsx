import Link from "next/link";
import { Headline, Section, Note, BackLink } from "../_components/Stage";

export const metadata = { title: "Dashboard · Help" };

export default function DashboardHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Reading the numbers · Dashboard"
        title="Where you stand, right now."
        dek="The dashboard is one screen of net positions per currency, plus the count of rows still waiting for review. It's the first page after sign-in."
      />

      <Section eyebrow="The tiles" title="Each tile is one currency.">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile
            label="Actual"
            body="The sum of every leg in this currency from rows with status Done. This is the truth right now."
          />
          <Tile
            label="Projected"
            body="Adds rows still In process. Useful when you've already initiated a transfer but the chain hasn't confirmed it yet."
          />
          <Tile
            label="Fees"
            body="A separate row at the bottom totals every Fee-typed leg, so you can see the cost of doing business."
          />
          <Tile
            label="Capital"
            body="Investor float. This number is sourced from the Capital page, not from the same legs as the trade column."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Under review" title="The amber chip is your inbox.">
        <p className="help-prose">
          The <strong>Under review</strong> tile counts unmatched, untyped
          imports. Click it to jump straight into{" "}
          <Link href="/app/transactions?review=1" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>
            Transactions filtered to the review queue
          </Link>
          . Aim to keep it at zero — every untyped row is one less honest
          report you can run.
        </p>
      </Section>

      <Note>
        Numbers refresh on navigation, not on a timer. Tap the dashboard tab
        again or hit the refresh button on Analytics if you&rsquo;ve just
        imported.
      </Note>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/transactions", title: "Transactions",  body: "What &lsquo;Done&rsquo; vs &lsquo;In process&rsquo; means at the row level." },
            { href: "/app/help/analytics",    title: "Analytics",     body: "Per-pair spread, day / week / month / custom." },
            { href: "/app/help/capital",      title: "Capital",       body: "Where the capital tile gets its number." },
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
