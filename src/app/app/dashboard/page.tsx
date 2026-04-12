import Link from "next/link";

export const metadata = {
  title: "Dashboard — AccPanel",
};

interface StatCard {
  label: string;
  value: string;
}

const STATS: StatCard[] = [
  { label: "Transactions", value: "0" },
  { label: "Wallets", value: "0" },
  { label: "Clients", value: "0" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Welcome to AccPanel v2
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border p-5"
            style={{
              backgroundColor: "#161b26",
              borderColor: "#1e2432",
            }}
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p
              className="mt-2 font-[family-name:var(--font-ibm-plex-mono)] text-3xl font-medium text-slate-100"
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Import CTA */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "#161b26",
          borderColor: "rgba(16,185,129,0.25)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Import your data from v1
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Bring in your existing master CSV or JSON export from AccPanel v1
              to get started.
            </p>
          </div>
          <Link
            href="/app/data"
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-zinc-900 transition hover:opacity-90"
            style={{ backgroundColor: "#10b981" }}
          >
            Go to Data
          </Link>
        </div>
      </div>

      {/* Supabase notice */}
      <div
        className="rounded-xl border px-5 py-4"
        style={{
          backgroundColor: "rgba(251,191,36,0.06)",
          borderColor: "rgba(251,191,36,0.2)",
        }}
      >
        <p className="text-sm text-yellow-400/80">
          Connect Supabase to activate live data.
        </p>
      </div>
    </div>
  );
}
