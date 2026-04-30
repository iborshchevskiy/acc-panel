import Link from "next/link";
import { Headline, Section, Note, BackLink } from "../_components/Stage";

export const metadata = { title: "Capital & debts · Help" };

export default function CapitalHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Reading the numbers · Capital"
        title="Whose money is in the float?"
        dek="Capital tracks investor deposits and withdrawals separately from operating revenue. Debts is the mirror — money you owe (or are owed) outside any closed trade."
      />

      <Section eyebrow="Capital page" title="Investor records, not client records.">
        <p className="help-prose">
          Investors live in their own table. They <em>never</em> mix into{" "}
          <Link href="/app/clients" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Clients</Link>
          {" "}— a client is someone you serve, an investor is someone who funds
          the float. Adding capital writes a single-leg inflow tagged with the
          investor name; withdrawing writes a single-leg outflow.
        </p>
        <Note>
          The investor field is a smart search. Type to find an existing
          record, or press <strong>Enter</strong> to create one on the fly.
          Capital records and Clients records are stored in separate tables —
          no cross-contamination.
        </Note>
        <p className="help-prose">
          The currency input is also a typeahead — popular codes from your
          own ledger come first (USDT typically wins), then alphabetical.
          Type the first letter and press <strong>Tab</strong>.
        </p>
      </Section>

      <Section eyebrow="Debts page" title="Receivables & payables.">
        <p className="help-prose">
          Debts are tracked as standalone transactions tagged{" "}
          <code>Debt</code>. Positive amount = you&rsquo;re owed money;
          negative = you owe. Repayment closes the row by linking the
          settlement transaction. The page totals open debts in your base
          currency and groups by client.
        </p>
      </Section>

      <Section eyebrow="Why split them" title="They mean different things on a P&amp;L.">
        <p className="help-prose">
          Capital is not income. Repayments are not expenses. Keeping them in
          their own pages means the dashboard can show <strong>Realised
          gain</strong> and <strong>Capital float</strong> as two distinct
          numbers, instead of one confused total.
        </p>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/dashboard",    title: "Dashboard",    body: "Where capital float and realised gain show up side by side." },
            { href: "/app/help/transactions", title: "Transactions", body: "All entries, including capital and debt, live here." },
            { href: "/app/help/fifo",         title: "FIFO",         body: "Capital movements are excluded from FIFO basis." },
          ]}
        />
      </Section>
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
