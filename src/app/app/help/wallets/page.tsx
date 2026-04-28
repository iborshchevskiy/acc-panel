import Link from "next/link";
import { Headline, Section, Steps, Note, BackLink, Stage } from "../_components/Stage";

export const metadata = { title: "Wallets · Help" };

export default function WalletsHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Essentials · Wallets"
        title="Add a wallet. Watch it sync."
        dek="Each wallet is one address on one chain. Once added, the importer fetches every confirmed transaction and turns each transfer into a row with two legs. Auto-import keeps it fresh."
      />

      <Stage title="/app/wallets · add wallet">
        <WalletScene />
      </Stage>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-4)" }}>
        Loop · paste, pick chain, sync
      </p>

      <Section eyebrow="Step by step" title="Five fields, then forget it.">
        <Steps
          items={[
            {
              title: "Paste the address",
              body: (
                <>
                  TRON, Ethereum (and EVM-compatible: BNB&nbsp;Chain), Solana.
                  Lower / mixed case is fine — addresses are normalised on save.
                </>
              ),
            },
            {
              title: "Pick the chain",
              body: (
                <>
                  The chain picker auto-suggests when the address shape is
                  unambiguous. For an EVM-style <code>0x…</code> address you may
                  need to choose between ETH and BNB manually.
                </>
              ),
            },
            {
              title: "Add a label",
              body: (
                <>
                  Free-form. <strong>&ldquo;Hot wallet · Binance&rdquo;</strong>,{" "}
                  <strong>&ldquo;Treasury&rdquo;</strong>,{" "}
                  <strong>&ldquo;Bot deposit&rdquo;</strong> — whatever lets
                  another teammate read the dashboard at 2&nbsp;AM and not call
                  you.
                </>
              ),
            },
            {
              title: "Click Add wallet",
              body: (
                <>
                  The row appears immediately with status <em>Idle</em>. The
                  first import hasn&rsquo;t run yet.
                </>
              ),
            },
            {
              title: "Run the first import",
              body: (
                <>
                  Press <strong>Import</strong> on the row. The status switches
                  to <em>Syncing</em>, the progress strip animates, and rows
                  start landing in <Link href="/app/transactions" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Transactions</Link>{" "}
                  with the <strong>Review</strong> badge.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Auto-import" title="Set it once, walk away.">
        <p className="help-prose">
          Toggle <strong>Auto-import</strong> on a wallet and the cron picks it
          up on its next tick. Default cadence is hourly; the long-term plan
          (per-wallet intervals) is on the roadmap. The cron route lives at{" "}
          <code>/api/cron/import</code> and runs server-side with a{" "}
          <code>CRON_SECRET</code> guard, so it works just as well in
          production as it does on a dev box with the <code>?force=1</code>{" "}
          override.
        </p>
        <Note>
          Auto-import never duplicates. Each chain importer hashes the source
          tx-id and skips rows that already exist for that wallet.
        </Note>
      </Section>

      <Section eyebrow="Reading the row" title="What the badges mean.">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <BadgeRow
            color="var(--text-3)"
            label="Idle"
            body="Wallet exists, no import has been requested yet."
          />
          <BadgeRow
            color="var(--amber)"
            label="Syncing"
            body="An import is running right now. The row is pinned until it finishes."
          />
          <BadgeRow
            color="var(--accent)"
            label="Synced"
            body="Last successful pull. The timestamp tells you when, the count tells you how many transactions are tied to this address."
          />
          <BadgeRow
            color="var(--red)"
            label="Failed"
            body="Network error, RPC throttling, or unsupported chain. Retry — the importer keeps a cursor, so it picks up where it left off."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Related" title="Up next">
        <RelatedGrid
          items={[
            { href: "/app/help/transactions", title: "Transactions",  body: "Edit imported rows, tag them, and add manual entries." },
            { href: "/app/help/import",       title: "Importing data", body: "CSV import is the other way to load history." },
            { href: "/app/help/clients",      title: "Clients",        body: "Match imports to people for FIFO and KYC." },
          ]}
        />
      </Section>
    </div>
  );
}

function BadgeRow({
  color,
  label,
  body,
  last,
}: {
  color: string;
  label: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-4 px-5 py-4"
      style={last ? undefined : { borderBottom: "1px solid var(--inner-border)" }}
    >
      <span
        className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <p className="flex-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
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

/* ── Animated scene ───────────────────────────────────────────────────── */

function WalletScene() {
  return (
    <div className="scene-wal-stage">
      {/* Add form */}
      <div className="scene-wal-form">
        <div className="scene-wal-input">
          <span className="scene-wal-typed">TXyZ7n6sjeu5R3aBvwaW2pYqRLXmJp9aGd</span>
          <span className="help-caret" />
        </div>
        <span className="scene-wal-chain">
          <span className="dot" />
          TRON
        </span>
        <span className="scene-wal-add">Add wallet</span>
      </div>

      {/* Wallet rows list */}
      <div style={{ padding: "12px 14px" }}>
        {/* Existing wallet */}
        <div
          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-2 py-2.5"
          style={{ borderBottom: "1px solid var(--inner-border)" }}
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium" style={{ color: "var(--text-1)" }}>
              Treasury
            </p>
            <p
              className="truncate font-mono text-[10.5px]"
              style={{ color: "var(--text-3)" }}
            >
              0x4c…9aF1 · ETH
            </p>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{
              color: "var(--accent)",
              background: "var(--accent-lo)",
              border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
            }}
          >
            ● Synced
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            12,407 tx
          </span>
        </div>

        {/* New wallet — animates in */}
        <div className="scene-wal-row">
          <div
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-2 py-2.5"
            style={{ borderBottom: "1px solid var(--inner-border)" }}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium" style={{ color: "var(--text-1)" }}>
                <span className="font-mono text-[12px]">TXyZ…aGd</span>
                <span className="ml-2 text-[10px]" style={{ color: "var(--text-4)" }}>
                  TRON
                </span>
              </p>
              <p className="font-mono text-[10.5px]" style={{ color: "var(--text-3)" }}>
                no label
              </p>
            </div>

            <div className="relative flex h-[18px] w-[80px] items-center justify-end">
              <span className="scene-wal-status syncing">
                <span style={{ marginRight: 6 }}>●</span>Syncing…
              </span>
              <span className="scene-wal-status synced absolute inset-0 flex items-center justify-end">
                <span style={{ marginRight: 6 }}>●</span>Synced
              </span>
            </div>

            <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
              just now
            </span>
          </div>

          {/* Progress under the row */}
          <div className="px-2 pb-2 pt-1.5">
            <div className="scene-wal-progress" />
          </div>
        </div>
      </div>
    </div>
  );
}
