import Link from "next/link";
import { Headline, Section, Note, BackLink, Stage } from "../_components/Stage";

export const metadata = { title: "FIFO · Help" };

export default function FifoHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Reading the numbers · FIFO"
        title="Gain is the spread, not the volume."
        dek="A first-in-first-out engine matches every disposal to the cost basis of the earliest remaining lot. Realised gain is the difference — small numbers, real money."
      />

      <Stage title="/app/fifo · spread by lot">
        <FifoBars />
      </Stage>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-4)" }}>
        Buy → sell → realised gain
      </p>

      <Section eyebrow="The model in one paragraph" title="">
        <p className="help-prose">
          Every <strong>buy</strong> creates a lot. Every <strong>sell</strong>{" "}
          consumes lots in the order they were created — oldest first. The
          difference between the sell price and the cost basis of the consumed
          slice is the realised gain. Volume is what you traded; gain is what
          you kept. They are <em>almost never</em> the same number.
        </p>
      </Section>

      <Note>
        Status matters. Rows marked <strong>Failed</strong> are skipped
        entirely. <strong>In&nbsp;process</strong> rows count toward the
        projected total but not the realised one — they have no cost basis
        until they finalise.
      </Note>

      <Section eyebrow="Reading the disposal table" title="Every line is one match.">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile
            label="Date"
            body="When the disposal happened. Earlier disposals appear first."
          />
          <Tile
            label="Slice"
            body="How much of the disposal this lot covered. A single sell can be split across several earlier buys."
          />
          <Tile
            label="Cost basis"
            body="The buy price for the consumed slice, in your base currency."
          />
          <Tile
            label="Proceeds"
            body="What you got for the slice, in the same base currency."
          />
          <Tile
            label="Realised gain"
            body="Proceeds minus cost basis. Click the row to jump to the originating transaction in /app/transactions."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Common puzzle" title="&ldquo;Why is gain so much smaller than volume?&rdquo;">
        <p className="help-prose">
          Because volume = sell-side proceeds, but gain = proceeds − basis.
          On a tight spread (a 0.4% margin on a EUR/USDT trade), 100,000 EUR
          of volume is 400 EUR of gain. The dashboard tile that says{" "}
          <strong>Realised</strong> shows the second number on purpose.
        </p>
      </Section>

      {/* ── Multi-leg splits ──────────────────────────────────────────────── */}
      <Section eyebrow="Multi-leg trades" title="One transfer paying for two currencies.">
        <p className="help-prose">
          Sometimes a single Exchange transaction has two recipients in
          different currencies — you wire 24,000 USDT and receive 15,000 EUR
          plus 100,000 CZK in one go. The engine has to decide how much of
          the USDT counts as the cost basis of the EUR side and how much
          counts toward the CZK side. It does so deterministically using{" "}
          <strong>rate priors</strong>: the median buy/sell VWAP from your{" "}
          <em>own</em> unambiguous trades for each pair. EUR gets weighted
          by ~1.16 USDT/EUR, CZK by ~0.048 USDT/CZK, and the 24,000 USDT
          splits in proportion to those USDT-equivalent values.
        </p>
        <p className="help-prose">
          Same-currency cross-direction legs are netted first. If a row has
          +100,000 CZK incoming and −1,200 CZK outgoing, the engine sees a
          net +98,800 CZK acquired — the small offsetting amount doesn&rsquo;t
          create a phantom CZK→CZK trade.
        </p>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/transactions", title: "Transactions",  body: "Where rows get the status and type that drive FIFO." },
            { href: "/app/help/analytics",    title: "Analytics",     body: "Spread per pair, the same number rolled up." },
            { href: "/app/help/clients",      title: "Clients",       body: "Per-client disposal — useful for compliance." },
          ]}
        />
      </Section>
    </div>
  );
}

function FifoBars() {
  return (
    <div className="scene-fifo-bars">
      <div className="scene-fifo-bar buy">
        <span className="col" />
        <span className="lbl">BUY · 100k</span>
      </div>
      <div className="scene-fifo-bar sell">
        <span className="col" />
        <span className="lbl">SELL · 100k</span>
      </div>
      <div className="scene-fifo-bar gain">
        <span className="col" />
        <span className="lbl" style={{ color: "var(--accent)" }}>GAIN · 400</span>
      </div>
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
