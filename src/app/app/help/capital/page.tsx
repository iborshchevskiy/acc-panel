import Link from "next/link";

export default function HelpCapitalPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <nav className="text-xs" style={{ color: "var(--text-3, #334155)" }}>
        <Link href="/app/help" className="hover:underline" style={{ color: "var(--text-3, #334155)" }}>← Help</Link>
      </nav>

      <header className="flex flex-col gap-2 pt-2">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>Capital &amp; investors</h1>
        <p className="max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          The Capital page tracks every time the organisation&rsquo;s own money
          moves in or out of the float — the cash pool you exchange against.
          Each entry names the investor who put the money in or took it out,
          the amount, and the currency.
        </p>
      </header>

      {/* Callout: why this is separate from Clients */}
      <aside
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--accent-lo, rgba(16,185,129,.10))",
          borderLeft: "2px solid var(--accent, #10b981)",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent, #10b981)" }}>
          Investors are not clients
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-1, #e2e8f0)" }}>
          Clients are the people you exchange money <em>for</em>. Investors are
          the people who provide the float you exchange <em>with</em>. They never
          appear on the <Link href="/app/clients" className="underline">Clients</Link> page, and clients
          never appear here.
        </p>
      </aside>

      {/* Quick task: log a deposit */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>Log a deposit</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          You brought 5,000 USDT from your own pocket to top up the float. Open
          the <Link href="/app/capital" className="underline" style={{ color: "var(--accent, #10b981)" }}>Capital page</Link> and
          fill the form at the top.
        </p>
        <ol className="flex flex-col gap-2 pl-4 text-sm leading-relaxed" style={{ color: "var(--text-1, #e2e8f0)", listStyle: "decimal" }}>
          <li>Pick today&rsquo;s date (pre-filled).</li>
          <li>
            Start typing the investor&rsquo;s name in the <strong>Investor</strong> field. As you type, the app searches
            existing investors and shows matches in a dropdown. If the investor is already there, click
            their name or press Enter to select.
          </li>
          <li>
            If no match exists, the dropdown shows a &ldquo;Create &lsquo;Name&rsquo; as new investor&rdquo;
            option at the bottom. Click it, or press Enter. The new record is saved immediately
            and selected for this operation.
          </li>
          <li>Enter the amount (<code style={{ color: "var(--text-2, #64748b)" }}>5000</code>) and the currency (<code style={{ color: "var(--text-2, #64748b)" }}>USDT</code>).</li>
          <li>Leave the type set to <strong>Deposit</strong> and add an optional comment for your own records.</li>
          <li>Click <strong>Add</strong>. The row appears in the ledger below and the investor&rsquo;s summary card updates.</li>
        </ol>
      </section>

      {/* Quick task: withdrawal */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>Log a withdrawal</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          Same form, switch the type to <strong>Withdrawal</strong>. The amount
          is entered as a positive number; the ledger shows it as negative and
          the summary card reduces by that amount.
        </p>
      </section>

      {/* Reading balance cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>Reading the summary cards</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          Above the form you&rsquo;ll see one card per investor. Each card shows
          the investor&rsquo;s running balance per currency — deposits minus
          withdrawals. Green means positive (they&rsquo;re ahead), red means
          negative (you owe them out, or their balance is below zero).
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          Investors you&rsquo;ve created but haven&rsquo;t logged any activity for yet
          still show a card, labelled <em>no activity yet</em>.
        </p>
      </section>

      {/* Watch out for */}
      <section
        className="flex flex-col gap-3 rounded-lg p-4"
        style={{
          backgroundColor: "var(--raised-hi, #161b27)",
          border: "1px solid var(--inner-border, #1e2432)",
        }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-1, #e2e8f0)" }}>Watch out for</h2>
        <ul className="flex flex-col gap-2 text-xs leading-relaxed" style={{ color: "var(--text-3, #334155)" }}>
          <li>
            <strong style={{ color: "var(--text-1, #e2e8f0)" }}>Spelling.</strong> Two investors named &ldquo;John Smith&rdquo; and
            &ldquo;John smith&rdquo; are two separate records — the search is
            case-insensitive but exact-match-aware. If you create a duplicate,
            delete the empty one from the ledger by removing all its entries.
          </li>
          <li>
            <strong style={{ color: "var(--text-1, #e2e8f0)" }}>Currency matters.</strong> An investor who deposits 1,000 EUR and
            later withdraws 1,000 USDT does <em>not</em> net to zero — the balance is
            tracked per currency.
          </li>
          <li>
            <strong style={{ color: "var(--text-1, #e2e8f0)" }}>Deletes are permanent.</strong> The × button next to each row in the
            ledger removes that operation without a confirmation prompt.
            Double-check before clicking.
          </li>
        </ul>
      </section>

      {/* Next topic */}
      <footer className="pt-2 text-xs" style={{ color: "var(--text-3, #334155)" }}>
        <Link href="/app/help/changelog" className="hover:underline" style={{ color: "var(--text-3, #334155)" }}>
          See what else changed recently →
        </Link>
      </footer>
    </article>
  );
}
