import Link from "next/link";

interface Topic {
  slug: string;
  title: string;
  tagline: string;
  group: "essentials" | "money" | "ops";
  animated?: boolean;
  icon: React.ReactNode;
}

const TOPICS: Topic[] = [
  // Essentials — daily flows
  {
    slug: "transactions",
    title: "Transactions",
    tagline: "Add a manual entry, edit a leg, tag types, mark a row reviewed.",
    group: "essentials",
    animated: true,
    icon: <IcTx />,
  },
  {
    slug: "wallets",
    title: "Wallets",
    tagline: "Add a chain wallet, kick off an import, turn on auto-sync.",
    group: "essentials",
    animated: true,
    icon: <IcWal />,
  },
  {
    slug: "clients",
    title: "Clients & KYC",
    tagline: "Match a transaction to a person, upload documents, read the chip.",
    group: "essentials",
    animated: true,
    icon: <IcCli />,
  },
  {
    slug: "import",
    title: "Importing data",
    tagline: "Drop a CSV, run a one-shot blockchain pull, configure the cron.",
    group: "essentials",
    animated: true,
    icon: <IcImp />,
  },

  // Money — what the dashboard is telling you
  {
    slug: "dashboard",
    title: "Dashboard",
    tagline: "Net positions, fees, capital, in-process — what each tile means.",
    group: "money",
    icon: <IcDash />,
  },
  {
    slug: "fifo",
    title: "FIFO & spread",
    tagline: "Why your realised gain looks small. Reading a disposal table.",
    group: "money",
    icon: <IcFifo />,
  },
  {
    slug: "analytics",
    title: "Analytics",
    tagline: "Spread by pair across day, week, month, or a custom window.",
    group: "money",
    icon: <IcAna />,
  },
  {
    slug: "capital",
    title: "Capital & debts",
    tagline: "Track investor float separately from receivables. Repay flows.",
    group: "money",
    icon: <IcCap />,
  },

  // Ops — keeping things running
  {
    slug: "settings",
    title: "Settings",
    tagline: "Members, currencies, transaction types, audit log, theme.",
    group: "ops",
    icon: <IcSet />,
  },
  {
    slug: "security",
    title: "Security & lock",
    tagline: "Matrix-key PIN, autolock, the panic button, signing out.",
    group: "ops",
    icon: <IcSec />,
  },
];

const GROUPS: { id: Topic["group"]; label: string; dek: string }[] = [
  { id: "essentials", label: "Essentials", dek: "The four flows you do every day." },
  { id: "money",      label: "Reading the numbers", dek: "How AccPanel summarises what happened." },
  { id: "ops",        label: "Operations",  dek: "Keeping the team and the data tidy." },
];

export default function HelpHubPage() {
  return (
    <div className="mx-auto max-w-[820px] px-6">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <header className="pt-16 pb-12 sm:pt-24 sm:pb-16">
        <p
          className="mb-4 text-[11px] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--accent)" }}
        >
          User Manual
        </p>
        <h1
          className="text-[44px] sm:text-[60px] font-semibold leading-[1.02] tracking-tight"
          style={{ color: "var(--text-1)" }}
        >
          Help.
          <br />
          <span style={{ color: "var(--text-3)" }}>Read once. Build muscle memory.</span>
        </h1>
        <p
          className="mt-6 max-w-xl text-[17px] leading-relaxed"
          style={{ color: "var(--text-3)" }}
        >
          Short, practical guides. Every essential flow has a looping
          micro-demo, so you can see the click before you make it.
        </p>
      </header>

      {/* ── Featured "essentials" rail ─────────────────────────────────── */}
      <section className="mb-20">
        <p
          className="mb-5 text-[11px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--text-3)" }}
        >
          Watch a 14-second demo
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TOPICS.filter((t) => t.animated).map((t) => (
            <FeatureCard key={t.slug} topic={t} />
          ))}
        </div>
      </section>

      {/* ── All topic groups ───────────────────────────────────────────── */}
      {GROUPS.map((g) => (
        <section key={g.id} className="mb-16">
          <div className="mb-5 flex items-baseline justify-between">
            <h2
              className="text-[20px] font-semibold tracking-tight"
              style={{ color: "var(--text-1)" }}
            >
              {g.label}
            </h2>
            <span className="text-[12px]" style={{ color: "var(--text-4)" }}>
              {g.dek}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--inner-border)", backgroundColor: "var(--inner-border)" }}
          >
            {TOPICS.filter((t) => t.group === g.id).map((t) => (
              <TopicRow key={t.slug} topic={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function FeatureCard({ topic }: { topic: Topic }) {
  return (
    <Link
      href={`/app/help/${topic.slug}`}
      className="group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-px"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--inner-border)",
      }}
    >
      <div className="flex items-start gap-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: "var(--accent-lo)", color: "var(--accent)" }}
        >
          {topic.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--text-1)" }}
          >
            {topic.title}
            <span
              className="ml-2 inline-flex translate-y-[-1px] items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
              style={{ background: "var(--accent-lo)", color: "var(--accent)" }}
            >
              demo
            </span>
          </p>
          <p
            className="mt-1.5 text-[13px] leading-relaxed"
            style={{ color: "var(--text-3)" }}
          >
            {topic.tagline}
          </p>
        </div>
        <span
          className="shrink-0 self-center transition-transform duration-300 group-hover:translate-x-0.5"
          style={{ color: "var(--text-4)" }}
        >
          <Arrow />
        </span>
      </div>
    </Link>
  );
}

function TopicRow({ topic }: { topic: Topic }) {
  return (
    <Link
      href={`/app/help/${topic.slug}`}
      className="group flex items-center gap-4 px-5 py-4 transition-colors"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
        style={{ background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--inner-border)" }}
      >
        {topic.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[14px] font-medium tracking-tight"
          style={{ color: "var(--text-1)" }}
        >
          {topic.title}
        </p>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-3)" }}>
          {topic.tagline}
        </p>
      </div>
      <span
        className="opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        style={{ color: "var(--text-3)" }}
      >
        <Arrow />
      </span>
    </Link>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 2.5L9.5 7 5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcTx() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 10l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcWal() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 6h14" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="9.5" r="1" fill="currentColor" />
    </svg>
  );
}
function IcCli() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11 7.5l1.5 1.5L15 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcImp() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IcDash() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function IcFifo() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="6" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 4h12M4 4V2M12 4V2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IcAna() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 12l3.5-4 3 2.5L12 5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcCap() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 13V8l3-3 3 2 3-4 3 2v8H2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcSet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function IcSec() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
