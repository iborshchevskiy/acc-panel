import Link from "next/link";

/**
 * Operator-facing version history. Intentionally lighter than the
 * developer-facing CHANGELOG.md at the repo root — this page summarises
 * what changed from a user's perspective, not every internal fix.
 *
 * Add a new entry whenever a user-visible feature ships. Keep each bullet
 * a single clear sentence; link to the relevant help topic when one exists.
 */

interface Release {
  version: string;
  date: string;
  heading: string;
  highlights: Array<{ title: string; body: string; href?: string }>;
}

const RELEASES: Release[] = [
  {
    version: "Unreleased",
    date: "in progress",
    heading: "Investors, help centre, change history",
    highlights: [
      {
        title: "Investors are now a real record, not just a typed name.",
        body:
          "The Investor field on the Capital page is a smart search. Type to find an existing investor; press Enter or click Create to add a new one. Investor records live alongside Capital and are never mixed into the Clients section.",
        href: "/app/help/capital",
      },
      {
        title: "Help centre.",
        body:
          "You're reading it. Topic pages for each area of the app, an Unreleased summary for what landed most recently, and this changelog for the full history.",
      },
    ],
  },
  {
    version: "0.8.1",
    date: "2026-04",
    heading: "Post-release fixes",
    highlights: [
      {
        title: "FIFO realized gains are accurate for exchange-office flows.",
        body:
          "Several edge-cases around short positions (selling crypto before sourcing it) and fiat/fiat swaps were producing incorrect gain numbers. FIFO now reflects the true spread you earned, not the total amount moved.",
      },
      {
        title: "Onboarding no longer redirects in a loop.",
        body:
          "Accounts without an organisation are redirected to onboarding cleanly. Previously the redirect could bounce in a loop on certain routes.",
      },
      {
        title: "Landing page and UI polish.",
        body:
          "A public-facing landing page at the site root, and a theme polish pass across every authenticated screen.",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-03",
    heading: "First feature-complete release",
    highlights: [
      {
        title: "Blockchain imports for TRON, ETH, BNB, and Solana.",
        body:
          "Add a wallet address, trigger an import, see the rows appear on the Transactions page. Imports deduplicate by transaction hash and support auto-import on an interval.",
      },
      {
        title: "Clients and KYC documents.",
        body:
          "A clients directory with personal details, wallet counterparties, and per-client document uploads for KYC and compliance.",
      },
      {
        title: "FIFO cost basis and Analytics.",
        body:
          "FIFO engine calculates realized gains per disposal (gain = sell rate − buy rate). Analytics shows spread per currency pair over day / week / month or a custom range.",
      },
      {
        title: "Capital, debts, and a data hub.",
        body:
          "Log deposits and withdrawals of the organisation's own float on the Capital page. Track outstanding balances per client on Debts. Export or import CSV / JSON from the Data page.",
      },
      {
        title: "Settings and multi-tenant hardening.",
        body:
          "Per-org name, base currency and timezone; member management with invites; currency and transaction-type customisation; audit log of every admin action.",
      },
    ],
  },
];

export default function HelpChangelogPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-2 pt-4">
        <p className="text-xs" style={{ color: "var(--text-3, #334155)" }}>
          <Link href="/app/help" className="hover:underline" style={{ color: "var(--text-3, #334155)" }}>
            ← Help
          </Link>
        </p>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>
          What changed and when
        </h1>
        <p className="max-w-xl text-sm" style={{ color: "var(--text-3, #334155)" }}>
          User-facing version history. Small internal fixes are omitted — see
          the repository&rsquo;s <code style={{ color: "var(--text-2, #64748b)" }}>CHANGELOG.md</code> for the full technical log.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {RELEASES.map((r) => (
          <section key={r.version} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-3 border-b pb-2" style={{ borderColor: "var(--inner-border, #1e2432)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>
                {r.version === "Unreleased" ? "Unreleased" : `v${r.version}`}
              </h2>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-3, #334155)" }}>
                {r.date}
              </span>
              <span className="text-sm" style={{ color: "var(--text-3, #334155)" }}>
                · {r.heading}
              </span>
            </div>

            <ol className="flex flex-col gap-4">
              {r.highlights.map((h) => (
                <li
                  key={h.title}
                  className="rounded-lg p-4"
                  style={{
                    backgroundColor: "var(--raised-hi, #161b27)",
                    border: "1px solid var(--inner-border, #1e2432)",
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>
                    {h.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
                    {h.body}
                  </p>
                  {h.href && (
                    <Link
                      href={h.href}
                      className="mt-2 inline-block text-xs transition-opacity hover:opacity-80"
                      style={{ color: "var(--accent, #10b981)" }}
                    >
                      Read more →
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
