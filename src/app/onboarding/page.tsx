"use client";

import { useState, useTransition } from "react";
import { createOrg } from "./actions";

const BASE_CURRENCIES = ["USD", "EUR", "CZK", "Other"] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<string>("USD");
  const [customCurrency, setCustomCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setOrgName(value);
    if (!slugManual) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManual(true);
    setSlug(value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const currency =
      baseCurrency === "Other" ? customCurrency.trim().toUpperCase() : baseCurrency;

    if (!currency) {
      setError("Enter a base currency.");
      return;
    }

    const fd = new FormData();
    fd.set("name", orgName);
    fd.set("slug", slug);
    fd.set("baseCurrency", currency);

    startTransition(async () => {
      const result = await createOrg(fd);
      if (result?.error) {
        setError(result.error);
      }
    });
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Organisation name
            </label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Trading Firm"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Slug
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="my-trading-firm"
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
              title="Lowercase letters, numbers, and hyphens only"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <p className="text-xs text-zinc-500">Lowercase letters, numbers, hyphens only.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">
              Base currency
            </label>
            <div className="flex flex-wrap gap-2">
              {BASE_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBaseCurrency(c)}
                  className={[
                    "rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    baseCurrency === c
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                      : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500",
                  ].join(" ")}
                >
                  {c}
                </button>
              ))}
            </div>
            {baseCurrency === "Other" && (
              <input
                type="text"
                required
                value={customCurrency}
                onChange={(e) => setCustomCurrency(e.target.value)}
                placeholder="e.g. GBP"
                maxLength={8}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {isPending ? "Creating…" : "Create organisation"}
          </button>
        </form>
      </div>
    </div>
  );
}
