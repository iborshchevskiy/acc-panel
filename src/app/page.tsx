import Link from "next/link";
import { Syne } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["600","700","800"] });

export const metadata = {
  title: "AccPanel — P2P Crypto Trading Accounting",
  description: "Professional double-entry accounting for P2P crypto traders. Multi-chain import, FIFO P&L, client tracking, audit-ready exports.",
};

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    title: "Multi-chain import",
    body: "One-click fetch from Tron (TRC-20), Ethereum, BNB Chain, and Solana. Automatic deduplication — re-import any time.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 12.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: "Double-entry ledger",
    body: "Every transaction is stored as debit/credit legs. Income, outcome, fees — captured with full audit trail.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 15L8 9l3 4 3-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "FIFO cost basis & P&L",
    body: "Realized gains calculated per lot using FIFO. Spread analysis by trading pair. Ready for tax reporting.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 17c0-3 2.2-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M13 9.5l1.5 1.5L17 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Client & counterparty tracking",
    body: "Link transactions to clients, attach wallet addresses, track outstanding debts and balances per counterparty.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3v14M6 6l4-3 4 3M6 14l4 3 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Export anywhere",
    body: "Download as semicolon CSV (Excel-ready) or JSON. Compatible with CoinTracking and other accounting platforms.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 6v4.5l3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    title: "Multi-currency & multi-org",
    body: "Set your base currency (USDT, EUR, USD…). Each organisation has isolated data, members, and settings.",
  },
];

const STEPS = [
  { n: "01", title: "Connect your wallets", body: "Add your Tron, ETH, BNB, or SOL addresses. AccPanel fetches the full transaction history automatically." },
  { n: "02", title: "Classify & assign", body: "Tag transactions as Exchange, Revenue, Expense, or Debt. Link them to clients. Split legs when needed." },
  { n: "03", title: "Report & export", body: "View FIFO P&L, balance sheets, and volume breakdowns. Export audit-ready CSV at any time." },
];

export default async function LandingPage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/app/dashboard");
  } catch { /* env not configured */ }

  return (
    <div className={`${syne.variable}`} style={{ backgroundColor: "var(--bg)", color: "var(--text-1)", fontFamily: "var(--font-dm-sans, DM Sans, system-ui)" }}>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 animate-fadein" style={{ borderBottom: "1px solid var(--border)", backdropFilter: "blur(12px)", backgroundColor: "rgba(7,9,12,0.85)" }}>
        <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold" style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>₿</span>
            <span className="font-[family-name:var(--font-syne)] text-sm font-bold tracking-tight" style={{ color: "var(--text-1)" }}>AccPanel</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm px-4 py-1.5 rounded-md transition-colors" style={{ color: "var(--text-2)" }}>Sign in</Link>
            <Link href="/signup" className="text-sm px-4 py-1.5 rounded-md font-medium transition-colors"
              style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>Get started</Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="min-h-screen flex items-center pt-14" style={{ background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(16,185,129,0.07) 0%, transparent 60%)" }}>
        {/* subtle grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.25,
        }} />

        <div className="relative mx-auto max-w-6xl px-6 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left */}
            <div>
              <div className="animate-fadeup inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-8"
                style={{ border: "1px solid rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.08)", color: "var(--accent)" }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ backgroundColor: "var(--accent)" }} />
                Built for P2P traders
              </div>

              <h1 className="animate-fadeup delay-100 font-[family-name:var(--font-syne)] font-bold leading-none tracking-tight mb-6"
                style={{ fontSize: "clamp(2.8rem, 5.5vw, 4.5rem)", color: "var(--text-1)" }}>
                P2P CRYPTO<br />
                ACCOUNTING.<br />
                <span style={{ color: "var(--accent)" }}>DONE RIGHT.</span>
              </h1>

              <p className="animate-fadeup delay-200 text-base leading-relaxed mb-10 max-w-md" style={{ color: "var(--text-2)" }}>
                Professional double-entry bookkeeping for traders who operate across
                multiple wallets, chains, and currencies. From raw blockchain data
                to audit-ready reports — in one panel.
              </p>

              <div className="animate-fadeup delay-300 flex items-center gap-3 flex-wrap">
                <Link href="/signup" className="inline-flex items-center gap-2 h-11 px-6 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>
                  Get started free
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7.5 4l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
                <Link href="/login" className="inline-flex items-center gap-2 h-11 px-6 rounded-lg text-sm font-medium transition-colors"
                  style={{ border: "1px solid var(--border-hi)", color: "var(--text-2)", backgroundColor: "transparent" }}>
                  Sign in
                </Link>
              </div>

              <div className="animate-fadeup delay-400 flex items-center gap-6 mt-12">
                {[["Tron", "TRC-20"], ["Ethereum", "EVM"], ["Solana", "SPL"]].map(([chain, label]) => (
                  <div key={chain} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>{chain}</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-3)", opacity: 0.6 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Terminal mockup */}
            <div className="animate-fadeup delay-200 lg:flex justify-end hidden">
              <div className="relative w-full max-w-[440px]" style={{ animation: "pulse-border 3s ease infinite" }}>
                {/* Glow */}
                <div className="absolute -inset-px rounded-xl" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), transparent, rgba(16,185,129,0.05))", filter: "blur(1px)" }} />

                <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid rgba(16,185,129,0.25)", backgroundColor: "var(--surface)" }}>
                  {/* Title bar */}
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "var(--raised)", borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                    </div>
                    <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>AccPanel — Transactions</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>12 Apr 2026</span>
                  </div>

                  {/* Scanner overlay */}
                  <div className="absolute left-0 right-0 h-8 pointer-events-none z-10" style={{
                    background: "linear-gradient(to bottom, transparent, rgba(16,185,129,0.06), transparent)",
                    animation: "scanline 3.5s linear infinite",
                    top: "0",
                  }} />

                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    {["DATE", "TYPE", "AMOUNT"].map(h => (
                      <span key={h} className="text-[10px] font-mono font-medium tracking-widest" style={{ color: "var(--text-3)" }}>{h}</span>
                    ))}
                  </div>

                  {/* Rows */}
                  {[
                    { date: "12 Apr", type: "Exchange", amount: "+1,250.00", ccy: "USDT", dir: "in" },
                    { date: "12 Apr", type: "Revenue",  amount: "+  842.00", ccy: "USDT", dir: "in" },
                    { date: "11 Apr", type: "Transfer", amount: "-2,000.00", ccy: "TRX",  dir: "out" },
                    { date: "11 Apr", type: "Exchange", amount: "+  567.50", ccy: "USDT", dir: "in" },
                    { date: "10 Apr", type: "Fee",      amount: "-    3.50", ccy: "TRX",  dir: "out" },
                    { date: "09 Apr", type: "Revenue",  amount: "+  390.00", ccy: "USDT", dir: "in" },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2.5"
                      style={{ borderBottom: "1px solid var(--border)", animation: `row-in 0.4s ${0.05 * i + 0.3}s both` }}>
                      <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>{row.date}</span>
                      <span className="text-xs" style={{ color: "var(--text-2)" }}>{row.type}</span>
                      <span className="text-xs font-mono whitespace-nowrap" style={{ color: row.dir === "in" ? "var(--accent)" : "var(--red)" }}>
                        {row.amount} {row.ccy}
                      </span>
                    </div>
                  ))}

                  {/* Balance footer */}
                  <div className="px-4 py-3" style={{ backgroundColor: "rgba(16,185,129,0.04)", borderTop: "1px solid rgba(16,185,129,0.15)" }}>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-mono tracking-widest" style={{ color: "var(--text-3)" }}>NET INCOME</span>
                      <span className="text-sm font-mono font-medium" style={{ color: "var(--accent)" }}>+3,046.00 USDT</span>
                    </div>
                  </div>
                </div>

                {/* Cursor blink */}
                <div className="absolute -bottom-3 left-4 flex items-center gap-1">
                  <span className="text-xs font-mono" style={{ color: "var(--accent)", opacity: 0.5 }}>$ _</span>
                  <span className="w-1.5 h-3.5 inline-block" style={{ backgroundColor: "var(--accent)", animation: "cursor-blink 1.1s step-end infinite" }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Ticker ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden py-3" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
        <div className="flex gap-12 whitespace-nowrap" style={{ animation: "ticker 30s linear infinite" }}>
          {[...Array(2)].map((_v, d) => (
            <div key={d} className="flex gap-12 shrink-0">
              {[
                ["USDT/TRX", "Exchange"],
                ["Multi-chain import", "Tron · ETH · BNB · SOL"],
                ["FIFO P&L", "Cost basis tracking"],
                ["Client tracking", "Counterparty management"],
                ["Audit exports", "CSV · JSON"],
                ["Multi-org", "Role-based access"],
                ["Double-entry", "Debit / Credit legs"],
              ].map(([a, b]) => (
                <div key={a} className="flex items-center gap-2 shrink-0">
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{a}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-3)" }}>{b}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: "var(--bg)" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14">
            <p className="text-xs font-mono tracking-widest mb-3" style={{ color: "var(--accent)" }}>FEATURES</p>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-3xl tracking-tight" style={{ color: "var(--text-1)" }}>
              Everything a P2P trader needs
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: "var(--border)" }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="p-6 flex flex-col gap-4" style={{ backgroundColor: "var(--surface)" }}>
                <div className="w-9 h-9 flex items-center justify-center rounded-lg" style={{ backgroundColor: "var(--accent-lo)", color: "var(--accent)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1.5" style={{ color: "var(--text-1)" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="py-24" style={{ backgroundColor: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14">
            <p className="text-xs font-mono tracking-widest mb-3" style={{ color: "var(--accent)" }}>HOW IT WORKS</p>
            <h2 className="font-[family-name:var(--font-syne)] font-bold text-3xl tracking-tight" style={{ color: "var(--text-1)" }}>
              From wallet to report in minutes
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-[calc(100%+1rem)] w-[calc(100%-2rem)] h-px" style={{ background: "linear-gradient(to right, var(--accent-lo), transparent)" }} />
                )}
                <div className="font-[family-name:var(--font-syne)] font-bold text-5xl mb-4 leading-none" style={{ color: "rgba(16,185,129,0.15)" }}>{s.n}</div>
                <h3 className="font-semibold text-base mb-2" style={{ color: "var(--text-1)" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="py-28" style={{ background: "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(16,185,129,0.06) 0%, transparent 70%)" }}>
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-8" style={{ backgroundColor: "var(--accent-lo)", border: "1px solid rgba(16,185,129,0.25)" }}>
            <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>₿</span>
          </div>
          <h2 className="font-[family-name:var(--font-syne)] font-bold text-4xl tracking-tight mb-5" style={{ color: "var(--text-1)" }}>
            Start tracking your trades today
          </h2>
          <p className="text-base mb-10 max-w-lg mx-auto" style={{ color: "var(--text-2)" }}>
            Set up your organisation in under 2 minutes. Free to start.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup" className="inline-flex items-center gap-2 h-12 px-8 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>
              Create free account
            </Link>
            <Link href="/login" className="inline-flex items-center h-12 px-8 rounded-lg text-sm font-medium"
              style={{ border: "1px solid var(--border-hi)", color: "var(--text-2)" }}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="py-8" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold" style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>₿</span>
            <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>AccPanel</span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            P2P crypto trading accounting panel
          </p>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-xs transition-colors" style={{ color: "var(--text-3)" }}>Sign in</Link>
            <Link href="/signup" className="text-xs transition-colors" style={{ color: "var(--text-3)" }}>Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
