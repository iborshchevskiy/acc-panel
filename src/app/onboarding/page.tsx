import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizationMembers } from "@/db/schema/system";
import { eq, and } from "drizzle-orm";
import { createOrg } from "./actions";

const BASE_CURRENCIES = ["USD", "EUR", "CZK", "GBP"] as const;

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  // If the visitor already belongs to an organisation, they have no business
  // on the onboarding form — bounce them to the dashboard. The earlier UX
  // let signed-in users hit /onboarding directly and accidentally create a
  // second org (one tester ended up with two: "Kaka" + "Binoq").
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const [existing] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.isActive, true),
      ))
      .limit(1);
    if (existing) redirect("/app/dashboard");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-8"
      style={{ backgroundColor: "var(--surface)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 sm:p-8"
        style={{ backgroundColor: "#161b26", borderColor: "var(--inner-border)" }}
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold"
            style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}
          >
            ₿
          </span>
          <h1 className="text-lg font-semibold text-slate-100">
            Set up your organisation
          </h1>
        </div>

        <p className="mb-6 text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>
          One-time step. We&rsquo;ll seed your default currencies and transaction
          types — you can change everything later in Settings.
        </p>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form action={createOrg} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Organisation name
            </label>
            <input
              name="name"
              type="text"
              required
              maxLength={120}
              autoFocus
              placeholder="My Trading Firm"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-xs" style={{ color: "var(--text-4)" }}>
              Anything you like. Cyrillic, Czech, emoji — it all works.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              Base currency
            </label>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {BASE_CURRENCIES.map((c, i) => (
                <label key={c} className="cursor-pointer">
                  <input
                    type="radio"
                    name="baseCurrency"
                    value={c}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span
                    className="block rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors border-zinc-700 bg-zinc-800/60 text-zinc-300 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/15 peer-checked:text-emerald-400 hover:border-zinc-500"
                  >
                    {c}
                  </span>
                </label>
              ))}
            </div>
            <input
              name="baseCurrencyCustom"
              type="text"
              maxLength={8}
              placeholder="or enter a custom code (e.g. PLN, AED)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2 text-sm uppercase text-zinc-100 placeholder:normal-case placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-xs" style={{ color: "var(--text-4)" }}>
              Used for FIFO and dashboard totals. You can change it later in Settings.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Create organisation
          </button>
        </form>
      </div>
    </div>
  );
}
