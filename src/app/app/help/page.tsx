import Link from "next/link";

interface Topic {
  slug: string;
  title: string;
  tagline: string;
  available: boolean;
  icon: React.ReactNode;
}

const TOPICS: Topic[] = [
  {
    slug: "capital",
    title: "Capital & investors",
    tagline: "Track who funds the float. Deposits, withdrawals, and the smart-search picker.",
    available: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v6M6 7h3a1.5 1.5 0 0 1 0 3H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  { slug: "quick-start", title: "Quick start", tagline: "Ten minutes from empty org to your first imported transaction.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 2v12l8-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg> },
  { slug: "wallets", title: "Wallets & imports", tagline: "Add a wallet on any chain, start imports, read the sync state.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><circle cx="11.5" cy="9.5" r="1" fill="currentColor" /></svg> },
  { slug: "transactions", title: "Transactions & legs", tagline: "What a leg is, why rows have legs in both directions, inline edit.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
  { slug: "clients-kyc", title: "Clients & KYC", tagline: "Client records, document uploads, the 15-doc and 10-MB limits.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
  { slug: "fifo", title: "FIFO — gain is the spread", tagline: "Why realized gain is smaller than volume, and how to read disposals.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="3" y="6" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="M2 4h12M4 4V2M12 4V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg> },
  { slug: "analytics", title: "Analytics", tagline: "Spread per pair. Day / week / month / custom range.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 12l3.5-4 3 2.5L12 5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { slug: "dashboard", title: "Dashboard", tagline: "Actual vs projected net positions, what the yellow chip means.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg> },
  { slug: "security", title: "Security & lock", tagline: "PIN, autolock, matrix-key unlock, Cmd/Ctrl+L hotkey.", available: false, icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 7V5a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.4" /></svg> },
];

export default function HelpIndexPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      {/* Hero */}
      <header className="flex flex-col gap-2 pt-4">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-1)" }}>Help &amp; User Guide</h1>
        <p className="max-w-xl text-sm" style={{ color: "var(--text-3)" }}>
          Short, practical answers to the questions an exchange-office operator
          actually asks. Pick a topic, or see what changed recently.
        </p>
      </header>

      {/* What's new */}
      <section
        className="rounded-xl p-5"
        style={{
          backgroundColor: "var(--raised-hi, #161b27)",
          border: "1px solid var(--inner-border, #1e2432)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--accent, #10b981)" }}>
              What's new · Unreleased
            </p>
            <h2 className="mt-1 text-base font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>
              Investors as a first-class entity on Capital
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--text-3, #334155)" }}>
              The Investor field on the Capital page is now a smart search.
              Type to find an existing investor or press Enter to create a new one.
              Investor records live alongside Capital; they are never mixed into
              the Clients section.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <Link
            href="/app/help/capital"
            className="rounded-md px-3 py-1.5 transition-opacity hover:opacity-80"
            style={{ backgroundColor: "var(--green-btn-bg, rgba(16,185,129,.15))", color: "var(--accent, #10b981)", border: "1px solid var(--green-btn-border, rgba(16,185,129,.25))" }}
          >
            Read the Capital guide →
          </Link>
          <Link
            href="/app/help/changelog"
            className="rounded-md px-3 py-1.5 transition-colors"
            style={{ color: "var(--text-3, #334155)", border: "1px solid var(--inner-border, #1e2432)" }}
          >
            Full change history
          </Link>
        </div>
      </section>

      {/* Topic grid */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-3, #334155)" }}>
          Topics
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TOPICS.map((t) => {
            const inner = (
              <div className="flex h-full items-start gap-3 p-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: t.available ? "var(--green-chip-bg, rgba(16,185,129,.12))" : "var(--slate-chip-bg, rgba(148,163,184,.12))",
                    color: t.available ? "var(--accent, #10b981)" : "var(--text-3, #334155)",
                  }}
                >
                  {t.icon}
                </span>
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: t.available ? "var(--text-1, #e2e8f0)" : "var(--text-3, #334155)" }}>
                    {t.title}
                    {!t.available && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                        style={{ backgroundColor: "var(--slate-chip-bg, rgba(148,163,184,.12))", color: "var(--text-3, #334155)" }}
                      >
                        coming soon
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
                    {t.tagline}
                  </p>
                </div>
              </div>
            );
            return t.available ? (
              <Link
                key={t.slug}
                href={`/app/help/${t.slug}`}
                className="rounded-xl transition-colors"
                style={{
                  backgroundColor: "var(--raised-hi, #161b27)",
                  border: "1px solid var(--inner-border, #1e2432)",
                }}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={t.slug}
                className="rounded-xl"
                style={{
                  backgroundColor: "var(--raised-hi, #161b27)",
                  border: "1px dashed var(--inner-border, #1e2432)",
                  opacity: 0.7,
                }}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
