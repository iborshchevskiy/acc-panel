import Link from "next/link";
import { Syne } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MouseSpotlight from "./(landing)/MouseSpotlight";
import ScrollReveal   from "./(landing)/ScrollReveal";
import CryptoLogo     from "./(landing)/CryptoLogo";
import ChainRail      from "./(landing)/ChainRail";
import ExportChips    from "./(landing)/ExportChips";
import HeroCarousel   from "./(landing)/HeroCarousel";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["600","700","800"] });

export const metadata = {
  title: "AccPanel — Accounting for the on-chain economy",
  description:
    "A double-entry ledger built for crypto exchange offices. Multi-chain auto-import, FIFO cost basis, KYC, audit-ready exports — all in one panel.",
};

// ── helpers ─────────────────────────────────────────────────────────────────

interface TickerEntry { sym: string; price: string; chg: string; dir: "up" | "down"; cgId: string }

const COIN_IDS = [
  ["bitcoin",      "BTC"],
  ["ethereum",     "ETH"],
  ["solana",       "SOL"],
  ["binancecoin",  "BNB"],
  ["ripple",       "XRP"],
  ["tron",         "TRX"],
  ["dogecoin",     "DOGE"],
  ["cardano",      "ADA"],
  ["avalanche-2",  "AVAX"],
  ["polkadot",     "DOT"],
] as const;

const TICKER_FALLBACK: TickerEntry[] = COIN_IDS.map(([id, sym]) => ({
  sym: `${sym}/USDT`, price: "—", chg: "—", dir: "up" as const, cgId: id,
}));

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1)    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return p.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return p.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

async function fetchTicker(): Promise<TickerEntry[]> {
  try {
    const ids = COIN_IDS.map(([id]) => id).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    // Next will dedup + cache this for 15 minutes (one outbound call per page,
    // shared across all visitors during the window).
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return TICKER_FALLBACK;
    const data = await res.json() as Record<string, { usd: number; usd_24h_change?: number }>;
    return COIN_IDS.map(([id, sym]) => {
      const row = data[id];
      if (!row || typeof row.usd !== "number") {
        return { sym: `${sym}/USDT`, price: "—", chg: "—", dir: "up" as const, cgId: id };
      }
      const chg = typeof row.usd_24h_change === "number" ? row.usd_24h_change : 0;
      const sign = chg >= 0 ? "+" : "−";
      return {
        sym:   `${sym}/USDT`,
        price: fmtPrice(row.usd),
        chg:   `${sign}${Math.abs(chg).toFixed(2)}%`,
        dir:   chg >= 0 ? ("up" as const) : ("down" as const),
        cgId:  id,
      };
    });
  } catch {
    return TICKER_FALLBACK;
  }
}

const CHAINS = [
  { code: "TRX", name: "TRON",     color: "#EF0027" },
  { code: "ETH", name: "Ethereum", color: "#627EEA" },
  { code: "BNB", name: "BNB",      color: "#F3BA2F" },
  { code: "SOL", name: "Solana",   color: "#9945FF" },
] as const;

// ── page ────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/app/dashboard");
  } catch { /* env not configured — render landing */ }

  // Real prices, cached for 15 minutes via Next fetch revalidation.
  const ticker = await fetchTicker();

  return (
    <div className={syne.variable}
      style={{ backgroundColor: "var(--bg)", color: "var(--text-1)", fontFamily: "var(--font-dm-sans, DM Sans, system-ui)" }}>

      {/* ─────────────────────────────────────────────────────────────────────
         NAV
         ───────────────────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50 animate-fadein"
        style={{
          borderBottom: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
          backdropFilter: "saturate(140%) blur(14px)",
          WebkitBackdropFilter: "saturate(140%) blur(14px)",
          backgroundColor: "rgba(7,9,12,0.72)",
        }}
      >
        <div className="mx-auto max-w-[1240px] flex items-center justify-between h-14 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold transition-transform group-hover:scale-105"
              style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}
            >₿</span>
            <span className="font-[family-name:var(--font-syne)] text-sm font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
              AccPanel
            </span>
            <span className="hidden sm:inline-block ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono tracking-widest"
              style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}>
              v2.0
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="#features"
              className="hidden sm:inline-flex h-9 items-center px-3 text-xs font-medium transition-colors rounded-md"
              style={{ color: "var(--text-2)" }}
            >
              Features
            </Link>
            <Link
              href="#how"
              className="hidden sm:inline-flex h-9 items-center px-3 text-xs font-medium transition-colors rounded-md"
              style={{ color: "var(--text-2)" }}
            >
              How it works
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center px-3 sm:px-4 text-xs font-medium rounded-md transition-colors"
              style={{ color: "var(--text-2)" }}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center px-3.5 sm:px-4 text-xs font-semibold rounded-md transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}
            >
              Open the panel
            </Link>
          </nav>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────────
         HERO
         ───────────────────────────────────────────────────────────────────── */}
      <section
        className="relative isolate min-h-screen flex items-center pt-20 sm:pt-24 overflow-hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        {/* Mouse spotlight (desktop only, no-op on touch) */}
        <MouseSpotlight className="absolute inset-0 -z-10 pointer-events-none" />

        {/* Drifting gradient orb */}
        <div
          aria-hidden
          className="absolute -z-20 pointer-events-none"
          style={{
            top: "-22%",
            left: "50%",
            width: 1200, height: 1200,
            transform: "translateX(-50%)",
            background: "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%)",
            animation: "mesh-drift 28s ease-in-out infinite",
            filter: "blur(40px)",
          }}
        />

        {/* Faint dot grid */}
        <div
          aria-hidden
          className="absolute inset-0 -z-30 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 90%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, #000 40%, transparent 90%)",
          }}
        />

        <div className="relative mx-auto max-w-[1240px] w-full px-5 sm:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">

            {/* ─── Left column ────────────────────────────────────────── */}
            <div className="lg:col-span-7">
              {/* Status pill */}
              <div className="animate-fadeup inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] mb-8"
                style={{
                  border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
                  backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
                  color: "var(--accent)",
                }}
              >
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                    style={{ backgroundColor: "var(--accent)" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ backgroundColor: "var(--accent)" }} />
                </span>
                System operational · v2.0
              </div>

              {/* Headline */}
              <h1
                className="animate-fadeup delay-100 font-[family-name:var(--font-syne)] font-bold mb-6"
                style={{
                  fontSize: "clamp(2.6rem, 7.4vw, 5.8rem)",
                  lineHeight: 0.92,
                  letterSpacing: "-0.025em",
                  color: "var(--text-1)",
                }}
              >
                Accounting<br/>
                for the<br/>
                <span style={{
                  color: "var(--accent)",
                  textShadow: "0 0 40px color-mix(in srgb, var(--accent) 28%, transparent)",
                }}>
                  on&#8209;chain
                </span><br/>
                economy.
              </h1>

              {/* Subhead */}
              <p
                className="animate-fadeup delay-200 mb-9 max-w-[520px] leading-relaxed"
                style={{ fontSize: "clamp(0.95rem, 1.2vw, 1.05rem)", color: "var(--text-5)" }}
              >
                A double-entry ledger built for crypto exchange offices.
                Multi-chain auto-import, FIFO cost basis, KYC, audit-ready
                exports — every transaction reconciled, every position visible,
                every report defensible.
              </p>

              {/* CTAs */}
              <div className="animate-fadeup delay-300 flex items-center gap-3 flex-wrap">
                <Link
                  href="/signup"
                  className="group inline-flex items-center gap-2 h-12 px-6 rounded-lg text-sm font-semibold transition-transform hover:translate-y-[-1px]"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#0d1117",
                    boxShadow: "0 12px 32px -8px color-mix(in srgb, var(--accent) 60%, transparent)",
                  }}
                >
                  Open the panel
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                    className="transition-transform group-hover:translate-x-0.5">
                    <path d="M3 7h8M7.5 4l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-lg text-sm font-medium transition-colors hover:bg-white/[0.03]"
                  style={{ border: "1px solid var(--border-hi)", color: "var(--text-2)" }}
                >
                  Sign in
                </Link>
              </div>

              {/* Chain rail (interactive, hover/tap-to-highlight) */}
              <div className="animate-fadeup delay-400 mt-10">
                <ChainRail />
              </div>
            </div>

            {/* ─── Right column: live carousel of app sections ─────────── */}
            <div className="lg:col-span-5 animate-fadeup delay-300 hidden lg:flex justify-end">
              <HeroCarousel
                panels={[
                  { id: "dashboard",    name: "Dashboard",    hint: "open dashboard",    node: <PanelDashboard /> },
                  { id: "transactions", name: "Transactions", hint: "list transactions", node: <PanelTransactions /> },
                  { id: "wallets",      name: "Wallets",      hint: "list wallets",      node: <PanelWallets /> },
                  { id: "clients",      name: "Clients",      hint: "list clients",      node: <PanelClients /> },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Bottom fade into ticker */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, var(--bg))" }} />
      </section>

      {/* ─────────────────────────────────────────────────────────────────────
         TICKER
         ───────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden py-3.5 relative"
        style={{
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
        }}>
        {/* Edge fades */}
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to right, var(--surface), transparent)" }} />
        <div aria-hidden className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to left, var(--surface), transparent)" }} />

        <div className="flex gap-8 whitespace-nowrap" style={{ animation: "ticker 28s linear infinite" }}>
          {[...Array(2)].map((_v, dup) => (
            <div key={dup} className="flex gap-8 shrink-0">
              {ticker.map((t) => {
                const baseSym = t.sym.split("/")[0];
                return (
                  <a
                    key={`${dup}-${t.sym}`}
                    href={`https://www.coingecko.com/en/coins/${t.cgId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 shrink-0 transition-opacity hover:opacity-100 focus:opacity-100"
                    style={{ opacity: 0.92 }}
                    title={`${t.sym} on CoinGecko`}
                  >
                    <CryptoLogo symbol={baseSym} size={18} />
                    <span className="text-[11px] font-mono font-semibold tracking-wider"
                      style={{ color: "var(--text-2)" }}>
                      {t.sym}
                    </span>
                    <span className="text-[12px] font-mono tabular-nums" style={{ color: "var(--text-1)" }}>
                      {t.price}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums"
                      style={{ color: t.dir === "up" ? "var(--accent)" : "var(--red)" }}>
                      {t.chg}
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Source caption — quiet, not in your face */}
      <div className="flex items-center justify-center gap-1.5 py-1.5"
        style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg)" }}>
        <span className="text-[9px] font-mono tracking-[0.16em] uppercase" style={{ color: "var(--text-3)" }}>
          rates · USD via
        </span>
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer"
          className="text-[9px] font-mono tracking-[0.16em] uppercase transition-opacity hover:opacity-100"
          style={{ color: "var(--text-2)", opacity: 0.8 }}>
          coingecko ↗
        </a>
        <span className="text-[9px] font-mono tracking-[0.16em] uppercase" style={{ color: "var(--text-3)" }}>
          · refreshed every 15 min
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
         FEATURES (bento)
         ───────────────────────────────────────────────────────────────────── */}
      <ScrollReveal>
      <section id="features" className="relative py-24 sm:py-32" style={{ backgroundColor: "var(--bg)" }}>
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">

          {/* Section header */}
          <div className="reveal max-w-2xl mb-14 sm:mb-20">
            <p className="text-[10px] font-mono tracking-[0.22em] uppercase mb-4"
              style={{ color: "var(--accent)" }}>
              · 02 / Capabilities
            </p>
            <h2 className="font-[family-name:var(--font-syne)] font-bold tracking-tight"
              style={{
                fontSize: "clamp(1.9rem, 4vw, 3rem)",
                lineHeight: 1.05,
                color: "var(--text-1)",
              }}>
              Built for the operators who keep<br className="hidden sm:inline"/>
              <span style={{ color: "var(--accent)" }}>real money moving</span> through crypto rails.
            </h2>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

            {/* Multi-chain — large hero card spans 2 cols on lg */}
            <BentoCard className="md:col-span-2 lg:col-span-2 reveal reveal-d1" minH={320}>
              <div className="relative h-full p-6 sm:p-8 flex flex-col">
                {/* Ambient background — orbital sits under the text via z-index */}
                <ChainOrbital />
                <div className="relative z-10">
                  <BentoLabel>01</BentoLabel>
                  <BentoTitle>Native multi-chain import</BentoTitle>
                  <BentoBody>
                    One connector per chain — TRON, Ethereum, BNB, Solana — fetches
                    the full transaction history, deduplicates by hash, and writes
                    double-entry legs in one shot. Re-import any time; nothing
                    doubles up.
                  </BentoBody>
                </div>
              </div>
            </BentoCard>

            {/* FIFO P&L */}
            <BentoCard className="lg:row-span-2 reveal reveal-d2" minH={320}>
              <div className="relative h-full p-6 sm:p-8 flex flex-col">
                <BentoLabel>02</BentoLabel>
                <BentoTitle>FIFO cost basis &amp; P&amp;L</BentoTitle>
                <BentoBody>
                  Realized gains computed per lot, FIFO. Spread analysis per
                  trading pair. Disposal breakdown links every realized gain
                  back to the buy and sell that produced it.
                </BentoBody>
                <FifoChart />
              </div>
            </BentoCard>

            {/* Real-time positions */}
            <BentoCard className="reveal reveal-d3">
              <div className="p-6 flex flex-col">
                <BentoLabel>03</BentoLabel>
                <BentoTitle>Real-time net positions</BentoTitle>
                <BentoBody compact>
                  Inventory per currency, updated as transactions land.
                  Actual vs. projected splits show what&apos;s in process.
                </BentoBody>
                <PositionsMini />
              </div>
            </BentoCard>

            {/* Multi-tenant */}
            <BentoCard className="reveal reveal-d4">
              <div className="p-6 flex flex-col">
                <BentoLabel>04</BentoLabel>
                <BentoTitle>Multi-tenant orgs</BentoTitle>
                <BentoBody compact>
                  Each organisation has isolated data, members, and roles.
                  Invite by email, assign admin / accountant / viewer.
                </BentoBody>
                <TenantStack />
              </div>
            </BentoCard>

            {/* Client / KYC */}
            <BentoCard className="reveal reveal-d5">
              <div className="p-6 flex flex-col">
                <BentoLabel>05</BentoLabel>
                <BentoTitle>Client &amp; KYC tracking</BentoTitle>
                <BentoBody compact>
                  Counterparty profiles, source-of-funds documents, debt
                  ledgers per client. Compliance-ready out of the box.
                </BentoBody>
                <KycMini />
              </div>
            </BentoCard>

            {/* Audit exports */}
            <BentoCard className="md:col-span-2 reveal reveal-d6">
              <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="max-w-md">
                  <BentoLabel>06</BentoLabel>
                  <BentoTitle>Audit-ready exports</BentoTitle>
                  <BentoBody compact>
                    Download the full ledger as semicolon CSV (Excel-native)
                    or JSON. Compatible with CoinTracking and most accountants&apos;
                    tools.
                  </BentoBody>
                </div>
                <ExportChips />
              </div>
            </BentoCard>

          </div>
        </div>
      </section>
      </ScrollReveal>

      {/* ─────────────────────────────────────────────────────────────────────
         HOW IT WORKS
         ───────────────────────────────────────────────────────────────────── */}
      <ScrollReveal>
      <section id="how" className="py-24 sm:py-32 relative" style={{
        backgroundColor: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <div className="reveal max-w-2xl mb-14 sm:mb-20">
            <p className="text-[10px] font-mono tracking-[0.22em] uppercase mb-4"
              style={{ color: "var(--accent)" }}>
              · 03 / Onboarding
            </p>
            <h2 className="font-[family-name:var(--font-syne)] font-bold tracking-tight"
              style={{
                fontSize: "clamp(1.9rem, 4vw, 3rem)",
                lineHeight: 1.05,
                color: "var(--text-1)",
              }}>
              From wallet address to <span style={{ color: "var(--accent)" }}>signed report</span>,
              in three moves.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 md:gap-6 relative">
            {/* Connecting hairline (desktop only) */}
            <div aria-hidden className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px"
              style={{ background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 35%, transparent), transparent)" }} />

            {STEPS.map((s, i) => (
              <div key={s.n} className={`reveal reveal-d${i+1} relative`}>
                {/* Big number + dot */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="relative">
                    <span className="font-[family-name:var(--font-syne)] font-bold leading-none block"
                      style={{
                        fontSize: "3.4rem",
                        color: "color-mix(in srgb, var(--accent) 18%, transparent)",
                        WebkitTextStroke: "1px color-mix(in srgb, var(--accent) 35%, transparent)",
                      }}>
                      {s.n}
                    </span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full mt-1"
                    style={{
                      backgroundColor: "var(--accent)",
                      boxShadow: "0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)",
                    }} />
                </div>
                <h3 className="font-[family-name:var(--font-syne)] font-semibold text-xl mb-2.5"
                  style={{ color: "var(--text-1)" }}>
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed max-w-sm" style={{ color: "var(--text-5)" }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </ScrollReveal>

      {/* ─────────────────────────────────────────────────────────────────────
         CTA
         ───────────────────────────────────────────────────────────────────── */}
      <ScrollReveal>
      <section className="relative py-28 sm:py-40 overflow-hidden">
        {/* Animated mesh */}
        <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 70% at 50% 50%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)",
            animation: "mesh-drift 22s ease-in-out infinite",
          }}
        />
        {/* Hairline horizons */}
        <div aria-hidden className="absolute left-0 right-0 top-1/2 h-px"
          style={{ background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent) 25%, transparent), transparent)" }} />

        <div className="reveal mx-auto max-w-[920px] px-5 sm:px-8 text-center">
          <p className="text-[10px] font-mono tracking-[0.22em] uppercase mb-5" style={{ color: "var(--accent)" }}>
            · 04 / Get started
          </p>
          <h2 className="font-[family-name:var(--font-syne)] font-bold tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.4rem, 6vw, 4.4rem)",
              lineHeight: 0.95,
              color: "var(--text-1)",
            }}>
            Ship the spreadsheet.<br/>
            <span style={{ color: "var(--accent)" }}>Open the panel.</span>
          </h2>
          <p className="text-base mb-12 max-w-xl mx-auto leading-relaxed" style={{ color: "var(--text-5)" }}>
            Provision your organisation in under two minutes.
            Free while in beta.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/signup" className="group inline-flex items-center gap-2 h-12 px-7 rounded-lg text-sm font-semibold transition-transform hover:translate-y-[-1px]"
              style={{
                backgroundColor: "var(--accent)",
                color: "#0d1117",
                boxShadow: "0 14px 36px -8px color-mix(in srgb, var(--accent) 65%, transparent)",
              }}>
              Create free account
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                className="transition-transform group-hover:translate-x-0.5">
                <path d="M3 7h8M7.5 4l3.5 3-3.5 3" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/login" className="inline-flex items-center h-12 px-7 rounded-lg text-sm font-medium transition-colors hover:bg-white/[0.03]"
              style={{ border: "1px solid var(--border-hi)", color: "var(--text-2)" }}>
              I already have one
            </Link>
          </div>
        </div>
      </section>
      </ScrollReveal>

      {/* ─────────────────────────────────────────────────────────────────────
         FOOTER
         ───────────────────────────────────────────────────────────────────── */}
      <footer className="py-10 sm:py-12" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold"
              style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>₿</span>
            <span className="font-[family-name:var(--font-syne)] text-sm font-bold tracking-tight"
              style={{ color: "var(--text-2)" }}>AccPanel</span>
            <span className="hidden sm:inline ml-2 text-[10px] font-mono"
              style={{ color: "var(--text-3)" }}>
              · made for serious operators.
            </span>
          </div>
          <p className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
            © {new Date().getFullYear()} · all rights reserved
          </p>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-[11px] font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--text-3)" }}>Sign in</Link>
            <Link href="/signup" className="text-[11px] font-medium transition-colors hover:opacity-80"
              style={{ color: "var(--text-3)" }}>Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ── small helpers (server components / pure JSX) ────────────────────────────

function BentoCard({
  children, className = "", minH,
}: { children: React.ReactNode; className?: string; minH?: number }) {
  return (
    <div
      className={`group relative rounded-2xl overflow-hidden transition-colors ${className}`}
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border)",
        minHeight: minH,
      }}
    >
      {/* hover glow ring */}
      <div aria-hidden className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent)" }} />
      {children}
    </div>
  );
}

function BentoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono tracking-[0.22em] uppercase mb-3" style={{ color: "var(--text-3)" }}>
      · {children}
    </p>
  );
}

function BentoTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-[family-name:var(--font-syne)] font-semibold mb-2.5"
      style={{ fontSize: "clamp(1.05rem, 1.4vw, 1.25rem)", color: "var(--text-1)", letterSpacing: "-0.005em" }}>
      {children}
    </h3>
  );
}

function BentoBody({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <p className={`text-sm leading-relaxed ${compact ? "max-w-xs" : "max-w-md"}`}
      style={{ color: "var(--text-5)" }}>
      {children}
    </p>
  );
}

// ── carousel panels (server-rendered, plugged into HeroCarousel) ────────────

function PanelDashboard() {
  const positions = [
    { c: "USDT", v: "+12,840", up: true  },
    { c: "EUR",  v: "+ 4,218", up: true  },
    { c: "CZK",  v: "+71,354", up: true  },
    { c: "TRX",  v: "−   850", up: false },
  ];
  const recent = [
    { t: "Exchange", a: "+842",  c: "USDT", up: true },
    { t: "Transfer", a: "−2,000", c: "BNB",  up: false },
    { t: "Exchange", a: "+567",  c: "USDT", up: true },
  ];
  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Hero P&L */}
      <div className="rounded-lg px-3.5 py-3" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)" }}>
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: "var(--text-3)" }}>Net P&amp;L · MTD</span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-ibm-plex-mono)] text-3xl font-medium leading-none tabular-nums"
            style={{ color: "var(--accent)" }}>+71,354</span>
          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>CZK</span>
        </div>
      </div>

      {/* Net positions chips */}
      <div>
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: "var(--text-3)" }}>Net positions</span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {positions.map(p => (
            <div key={p.c} className="flex items-center justify-between px-2.5 py-1.5 rounded"
              style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)" }}>
              <span className="text-[10px] font-medium" style={{ color: "var(--text-2)" }}>{p.c}</span>
              <span className="text-[11px] font-mono font-semibold tabular-nums"
                style={{ color: p.up ? "var(--accent)" : "var(--red)" }}>{p.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="flex-1">
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: "var(--text-3)" }}>Recent activity</span>
        <div className="mt-1.5 flex flex-col">
          {recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5"
              style={{ borderBottom: i < recent.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none" }}>
              <span className="text-[10px]" style={{ color: "var(--text-2)" }}>{r.t}</span>
              <span className="text-[10px] font-mono tabular-nums"
                style={{ color: r.up ? "var(--accent)" : "var(--red)" }}>
                {r.a} <span style={{ opacity: 0.6 }}>{r.c}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelTransactions() {
  const rows = [
    { t: "14:22", chain: "TRX",  type: "Exchange", amt: "+1,250.00", ccy: "USDT", dir: "in"  },
    { t: "13:51", chain: "ETH",  type: "Exchange", amt: "+  842.00", ccy: "USDT", dir: "in"  },
    { t: "11:08", chain: "BNB",  type: "Transfer", amt: "−2,000.00", ccy: "BNB",  dir: "out" },
    { t: "10:41", chain: "SOL",  type: "Exchange", amt: "+  567.50", ccy: "USDT", dir: "in"  },
    { t: "09:02", chain: "TRX",  type: "Fee",      amt: "−    3.50", ccy: "TRX",  dir: "out" },
  ];
  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Filter pills */}
      <div className="flex gap-1.5">
        {["All", "Exchange", "Transfer", "Fee"].map((f, i) => (
          <span key={f} className="text-[10px] font-medium px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: i === 0 ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--raised)",
              border: i === 0 ? "1px solid color-mix(in srgb, var(--accent) 35%, transparent)" : "1px solid var(--border)",
              color: i === 0 ? "var(--accent)" : "var(--text-3)",
            }}>{f}</span>
        ))}
      </div>

      {/* Header */}
      <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 pb-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}>
        {["TIME","CHAIN","TYPE","AMOUNT"].map(h => (
          <span key={h} className="text-[9px] font-mono font-medium tracking-[0.16em]"
            style={{ color: "var(--text-3)" }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 flex flex-col">
        {rows.map((row, i) => (
          <div key={i}
            className="grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center py-2"
            style={{
              borderBottom: i < rows.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none",
              animation: `ledger-cycle 9.5s ease-in-out ${i * 1.1}s infinite`,
            }}>
            <span className="text-[10px] font-mono" style={{ color: "var(--text-3)" }}>{row.t}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ color: "var(--text-2)", backgroundColor: "var(--raised)" }}>{row.chain}</span>
            <span className="text-[11px]" style={{ color: "var(--text-2)" }}>{row.type}</span>
            <span className="text-[11px] font-mono whitespace-nowrap tabular-nums"
              style={{ color: row.dir === "in" ? "var(--accent)" : "var(--red)" }}>
              {row.amt} <span style={{ opacity: 0.65 }}>{row.ccy}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelWallets() {
  const wallets = [
    { sym: "TRX", chain: "TRON",     addr: "TQDC8…h4Wn3", bal: "182,440 USDT", sync: "2 min ago", auto: true  },
    { sym: "ETH", chain: "Ethereum", addr: "0xA1b2…F7e8", bal:  "12.840 ETH",  sync: "5 min ago", auto: true  },
    { sym: "SOL", chain: "Solana",   addr: "3kpQ…g8Vt",   bal: "1,420 USDC",   sync: "12 min ago", auto: false },
    { sym: "BNB", chain: "BNB",      addr: "0xB9c4…L0d2", bal:  "0.842 BNB",   sync: "1 hour ago", auto: true  },
  ];
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: "var(--text-3)" }}>4 wallets · all synced</span>
        <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>+ Add</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {wallets.map((w, i) => (
          <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg"
            style={{
              backgroundColor: "var(--raised)",
              border: "1px solid var(--border)",
              animation: `ledger-cycle 11s ease-in-out ${i * 1.3}s infinite`,
            }}>
            <CryptoLogo symbol={w.sym} size={22} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-1)" }}>{w.chain}</span>
                <span className="text-[9px] font-mono truncate" style={{ color: "var(--text-3)" }}>{w.addr}</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--text-2)" }}>{w.bal}</span>
                <span className="text-[9px] font-mono" style={{ color: "var(--text-3)" }}>· {w.sync}</span>
              </div>
            </div>
            {w.auto && (
              <span className="shrink-0 inline-flex items-center gap-1 text-[8px] font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
                <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                auto
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelClients() {
  const clients = [
    { initial: "M", name: "Marko D.",      tg: "@markodrk",   debt: "0",       up: true,  txs: 42 },
    { initial: "A", name: "Anna Pet…",     tg: "@anpet22",    debt: "+1,200",  up: true,  txs: 18 },
    { initial: "K", name: "Karel N.",      tg: "@knovak",     debt: "−820",    up: false, txs: 31 },
    { initial: "J", name: "Jana M.",       tg: "@janamil",    debt: "+450",    up: true,  txs: 7  },
    { initial: "P", name: "Petr H.",       tg: "@phrad",      debt: "0",       up: true,  txs: 12 },
  ];
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: "var(--text-3)" }}>5 of 36 clients</span>
        <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>+ New</span>
      </div>
      <div className="flex flex-col flex-1">
        {clients.map((c, i) => (
          <div key={i} className="flex items-center gap-2.5 py-2"
            style={{
              borderBottom: i < clients.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none",
              animation: `ledger-cycle 12s ease-in-out ${i * 1.0}s infinite`,
            }}>
            {/* avatar */}
            <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ backgroundColor: "var(--raised-hi)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
              {c.initial}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium truncate" style={{ color: "var(--text-1)" }}>{c.name}</span>
                <span className="text-[9px] font-mono truncate" style={{ color: "var(--text-3)" }}>{c.tg}</span>
              </div>
              <span className="text-[9px] font-mono" style={{ color: "var(--text-3)" }}>{c.txs} txs</span>
            </div>
            <span className="text-[11px] font-mono tabular-nums shrink-0"
              style={{ color: c.debt === "0" ? "var(--text-3)" : c.up ? "var(--accent)" : "var(--red)" }}>
              {c.debt} <span style={{ opacity: 0.65 }}>USDT</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3D galaxy orbital — three tilted orbital planes carrying crypto logos.
// Each level cleanly separates one transform responsibility from another so
// CSS animation never overrides static positioning (the bug that caused
// logos to "respawn at center" in the previous version).
//
// Nesting per logo, from outside in:
//   tilt frame   — static rotateX, defines the orbital plane angle
//   spinner      — animated rotate(Z), spins logos around the plane
//   stub         — static rotate(angle) translateY(-radius), positions on ring
//   counter-spin — animated rotate(Z) reverse, undoes spinner so logo
//                  doesn't tumble as the ring carries it around
//   counter-tilt — static rotateX(-tilt), faces logo back at the camera
//
// Items per ring chosen so circumference / item-size stays comfortable;
// no two ring radii are within 50px of each other → rings never collide.

const ORBIT_PLANES = [
  { items: ["BTC","ETH","USDT","BNB","SOL","XRP","AVAX","DOGE"] as const,
    radius: 230, tilt: 68,  speed: 110, reverse: false, size: 24, opacity: 0.36 },
  { items: ["TRX","USDC","ADA","MATIC"] as const,
    radius: 160, tilt: 58,  speed: 80,  reverse: true,  size: 20, opacity: 0.26 },
  { items: ["BTC","ETH","SOL"] as const,
    radius: 95,  tilt: 48,  speed: 55,  reverse: false, size: 18, opacity: 0.18 },
];

function Starfield() {
  // Deterministic pseudo-random scatter so SSR matches client (no hydration
  // mismatch). Same seed → same dots every render.
  const dots = Array.from({ length: 36 }, (_, i) => {
    const r = (Math.sin(i * 78.233) + 1) / 2;
    const r2 = (Math.cos(i * 39.117) + 1) / 2;
    const r3 = (Math.sin(i * 12.91)  + 1) / 2;
    return {
      top:  `${r * 100}%`,
      left: `${r2 * 100}%`,
      size: 1 + r3 * 1.5,
      op:   0.10 + r3 * 0.18,
    };
  });
  return (
    <div className="absolute inset-0 pointer-events-none">
      {dots.map((d, i) => (
        <span key={i} className="absolute rounded-full"
          style={{
            top: d.top, left: d.left,
            width: d.size, height: d.size,
            backgroundColor: "var(--text-1)",
            opacity: d.op,
          }} />
      ))}
    </div>
  );
}

function ChainOrbital() {
  return (
    <div aria-hidden className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Galaxy backdrop */}
      <Starfield />

      {/* 3D scene root — perspective gives depth to all child rotateX */}
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: "1400px", perspectiveOrigin: "70% 50%" }}>
        <div className="relative" style={{ width: 0, height: 0, transformStyle: "preserve-3d" }}>

          {ORBIT_PLANES.map((plane, planeIdx) => {
            const dir        = plane.reverse ? "reverse" : "";
            const counterDir = plane.reverse ? "" : "reverse";

            return (
              <div key={planeIdx} className="absolute"
                style={{
                  top: 0, left: 0, width: 0, height: 0,
                  transformStyle: "preserve-3d",
                  // Static tilt — rotates the orbital plane in 3D
                  transform: `rotateZ(${planeIdx * 30}deg) rotateX(${plane.tilt}deg)`,
                }}>
                {/* Faint elliptical guide ring (in the tilted plane) */}
                <div className="absolute rounded-full"
                  style={{
                    top: -plane.radius, left: -plane.radius,
                    width: plane.radius * 2, height: plane.radius * 2,
                    border: "1px dashed color-mix(in srgb, var(--accent) 8%, transparent)",
                  }} />

                {/* Spinner — only animates rotate(Z); no static transform */}
                <div className="absolute"
                  style={{
                    top: 0, left: 0, width: 0, height: 0,
                    transformStyle: "preserve-3d",
                    animation: `orbit-slow ${plane.speed}s linear infinite ${dir}`,
                  }}>
                  {plane.items.map((sym, i) => {
                    const angle = (i / plane.items.length) * 360;
                    return (
                      <div key={`${planeIdx}-${i}`} className="absolute"
                        style={{
                          // Stub: pure positioning at angle on the ring
                          top: 0, left: 0, width: 0, height: 0,
                          transformStyle: "preserve-3d",
                          transform: `rotate(${angle}deg) translateY(-${plane.radius}px)`,
                        }}>
                        {/* Counter-spinner — only animates reverse rotate */}
                        <div
                          style={{
                            position: "absolute",
                            top: -plane.size / 2, left: -plane.size / 2,
                            width: plane.size, height: plane.size,
                            transformStyle: "preserve-3d",
                            animation: `orbit-slow ${plane.speed}s linear infinite ${counterDir}`,
                          }}>
                          {/* Counter-angle + counter-tilt — faces the camera */}
                          <div
                            style={{
                              width: "100%", height: "100%",
                              transform: `rotate(-${angle}deg) rotateX(-${plane.tilt}deg) rotateZ(-${planeIdx * 30}deg)`,
                              opacity: plane.opacity,
                              filter: "saturate(0.65)",
                            }}>
                            <CryptoLogo symbol={sym} size={plane.size} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      {/* Vignette so the type stays crisp on the left */}
      <div className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 75% at 26% 50%, var(--surface) 0%, color-mix(in srgb, var(--surface) 70%, transparent) 38%, transparent 78%)",
        }} />
    </div>
  );
}

function FifoChart() {
  // SVG sparkline that draws in via stroke-dashoffset
  return (
    <div className="mt-6 flex-1 flex flex-col justify-end">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          USDT/EUR realized
        </span>
        <span className="text-sm font-mono tabular-nums font-semibold" style={{ color: "var(--accent)" }}>
          +€4,218
        </span>
      </div>
      <svg viewBox="0 0 200 90" className="w-full h-[110px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,72 L20,68 L40,55 L60,62 L80,42 L100,48 L120,30 L140,38 L160,18 L180,24 L200,8 L200,90 L0,90 Z"
          fill="url(#fillg)" />
        <path d="M0,72 L20,68 L40,55 L60,62 L80,42 L100,48 L120,30 L140,38 L160,18 L180,24 L200,8"
          fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="400" strokeDashoffset="400"
          style={{ animation: "chart-draw 2.4s ease-out 0.4s forwards" }} />
        {/* Last point */}
        <circle cx="200" cy="8" r="3" fill="var(--accent)">
          <animate attributeName="r" values="3;5;3" dur="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      <div className="flex justify-between text-[9px] font-mono mt-1.5" style={{ color: "var(--text-3)" }}>
        <span>30d</span><span>now</span>
      </div>
    </div>
  );
}

function PositionsMini() {
  const items = [
    { c: "USDT", v: "+12,840", up: true  },
    { c: "EUR",  v: "+ 4,218", up: true  },
    { c: "TRX",  v: "−   850", up: false },
  ];
  return (
    <div className="mt-6 flex flex-col gap-1.5">
      {items.map(i => (
        <div key={i.c} className="flex items-center justify-between py-1.5 px-2.5 rounded"
          style={{ backgroundColor: "var(--raised)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-2)" }}>{i.c}</span>
          <span className="text-[12px] font-mono font-semibold tabular-nums"
            style={{ color: i.up ? "var(--accent)" : "var(--red)" }}>
            {i.v}
          </span>
        </div>
      ))}
    </div>
  );
}

function TenantStack() {
  return (
    <div className="mt-6 relative h-[88px]">
      {[0, 1, 2].map(i => (
        <div key={i} className="absolute left-0 right-0 rounded-lg p-2.5 flex items-center gap-2"
          style={{
            top: i * 12,
            height: 44,
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            transform: `translateY(${i * 6}px) scale(${1 - i * 0.04})`,
            opacity: 1 - i * 0.18,
            zIndex: 3 - i,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}>
          <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: "var(--accent)", color: "#0d1117" }}>
            {["A","B","C"][i]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 rounded mb-1.5" style={{ backgroundColor: "var(--border-hi)", width: `${72 - i*15}%` }} />
            <div className="h-1 rounded" style={{ backgroundColor: "var(--border)", width: `${50 - i*10}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function KycMini() {
  return (
    <div className="mt-6 flex gap-2">
      {["PASS","ID","POA"].map((k) => (
        <div key={k} className="flex-1 rounded p-2.5 flex flex-col gap-1.5"
          style={{ backgroundColor: "var(--raised)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="w-3 h-3.5 rounded-sm" style={{
              background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, transparent))",
            }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
          </div>
          <span className="text-[9px] font-mono" style={{ color: "var(--text-3)" }}>{k}</span>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Connect your wallets",
    body: "Add TRON, Ethereum, BNB, or Solana addresses. The full transaction history streams in within seconds — no exchange API keys, no CSV gymnastics.",
  },
  {
    n: "02",
    title: "Auto-classify & assign",
    body: "Each transaction lands as a double-entry pair. Tag types, link counterparties, attach KYC. The review queue surfaces only the rows that need a human.",
  },
  {
    n: "03",
    title: "Reconcile & report",
    body: "FIFO P&L, spread analysis, debt ledgers, audit-ready exports. Defensible reports, on demand, in any format your accountant accepts.",
  },
];
