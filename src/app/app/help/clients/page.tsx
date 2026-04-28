import Link from "next/link";
import { Headline, Section, Steps, Note, BackLink, Stage } from "../_components/Stage";

export const metadata = { title: "Clients & KYC · Help" };

export default function ClientsHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Essentials · Clients"
        title="A row without a person is half a story."
        dek="Match a transaction to a client and you unlock per-person history, KYC documents, and the disposal report. Unmatched rows still count toward FIFO — but you can't tell who you owe a receipt to."
      />

      <Stage title="/app/transactions · client picker">
        <ClientScene />
      </Stage>
      <p className="mt-3 text-center text-[12px]" style={{ color: "var(--text-4)" }}>
        Loop · matching a transaction
      </p>

      <Section eyebrow="Match a transaction" title="The picker is the whole story.">
        <Steps
          items={[
            {
              title: "Click the client cell",
              body: (
                <>
                  Any unmatched row shows a thin <code>—</code> in the client
                  column. Click it. The picker opens in place; no modal, no
                  page change.
                </>
              ),
            },
            {
              title: "Search by name, surname or @handle",
              body: (
                <>
                  Typing filters live across <strong>name</strong>,{" "}
                  <strong>surname</strong>, and <strong>tg_username</strong>.
                  Matches highlight, the rest fade out.
                </>
              ),
            },
            {
              title: "Press Enter to create",
              body: (
                <>
                  No match? Hit <strong>Enter</strong> with text in the box and
                  AccPanel creates a new client record on the spot — name only,
                  KYC docs come later.
                </>
              ),
            },
            {
              title: "The chip lands on the row",
              body: (
                <>
                  A blue pill replaces the dash. The audit log records who
                  matched what, and the row counts toward this client&rsquo;s
                  FIFO from now on.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="The client page" title="One file per person.">
        <p className="help-prose">
          Click the chip to open <code>/app/clients/[id]</code>. You&rsquo;ll
          see four blocks:
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PanelCard
            title="Personal details"
            body="Name, DOB, sex, address, phone, email, source of funds, source of wealth. All optional, all stored in the client record."
          />
          <PanelCard
            title="Documents"
            body="Drag-and-drop into Legal or Compliance. Up to 15 files per section, 10 MB each. Uploaded files keep their original filename."
          />
          <PanelCard
            title="Transactions"
            body="Every matched row in reverse-chronological order. Click through to the row in /app/transactions."
          />
          <PanelCard
            title="Wallets"
            body="Auto-derived from the on-chain transactions matched to this client. Read-only — managed via Wallets."
          />
        </div>
      </Section>

      <Note>
        The 15-doc limit is a soft cap to keep the upload UI fast. Need more?
        Bundle them into a zip. The 10-MB-per-file limit is hard — it&rsquo;s
        enforced by the storage layer.
      </Note>

      <Section eyebrow="Bulk match" title="When the importer dumps a hundred rows.">
        <p className="help-prose">
          Select rows in <Link href="/app/transactions" className="underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Transactions</Link>{" "}
          with the row checkboxes. The bulk bar appears at the bottom of the
          screen. <strong>Assign client</strong> opens the same picker, applies
          to every selection, and the audit log records a single <code>bulk_client_assigned</code>{" "}
          event with the count.
        </p>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/transactions", title: "Transactions",  body: "Where matching happens, in the row." },
            { href: "/app/help/fifo",         title: "FIFO & spread", body: "Disposal reporting needs a client to be useful." },
            { href: "/app/help/security",     title: "Security",      body: "Lock the panel before stepping away from KYC docs." },
          ]}
        />
      </Section>
    </div>
  );
}

function PanelCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
      <p className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
        {title}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
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

/* ── Animated scene — recreates the real ClientPicker on a tx row ───── */

function ClientScene() {
  return (
    <div className="scene-cli-stage">
      {/* A small slice of the Transactions table — three rows, the middle
          one has an unmatched client cell that we'll match in the demo. */}

      {/* Row 1 — already matched to Pavel L. */}
      <div className="scene-cli-row">
        <span className="date">2026-04-27 14:09</span>
        <span className="real-pill real-pill-exchange">Exchange</span>
        <span className="gain">+520.00 USDT</span>
        <span className="loss">−500.00 EUR</span>
        <span className="real-client-chip">
          <span className="av">P</span>Pavel L.
        </span>
      </div>

      {/* Row 2 — the target row. "+ client" placeholder swaps to Anna K. chip. */}
      <div className="scene-cli-row" style={{ position: "relative" }}>
        <span className="date">2026-04-27 11:32</span>
        <span className="real-pill real-pill-exchange">Exchange</span>
        <span className="gain">+1,290.40 USDT</span>
        <span className="loss">−1,200.00 USD</span>
        <span className="scene-cli-target">
          <span className="scene-cli-empty">+ client</span>
          <span className="scene-cli-chip">
            <span className="av">A</span>Anna K.
          </span>
        </span>
      </div>

      {/* Row 3 — already matched, ambience */}
      <div className="scene-cli-row">
        <span className="date">2026-04-26 19:50</span>
        <span className="real-pill real-pill-exchange">Exchange</span>
        <span className="gain">+248.00 USDT</span>
        <span className="loss">−250.00 USD</span>
        <span className="real-client-chip">
          <span className="av">M</span>Marko D.
        </span>
      </div>

      {/* The actual ClientPicker portal popover, anchored over row 2. */}
      <div className="scene-cli-popover" aria-hidden>
        <div className="scene-cli-search-wrap">
          <div className="scene-cli-search">
            <span className="scene-cli-typed">Anna</span>
            <span className="help-caret" />
          </div>
        </div>
        <div className="scene-cli-list">
          <div className="scene-cli-option hit">
            <span className="av">A</span>
            <div className="meta">
              <span className="name">Anna Karenina</span>
              <span className="handle">@anna_k</span>
            </div>
          </div>
          <div className="scene-cli-option miss">
            <span className="av">A</span>
            <div className="meta">
              <span className="name">Andrei Smirnov</span>
              <span className="handle">@asmirnov</span>
            </div>
          </div>
          <div className="scene-cli-option miss">
            <span className="av">M</span>
            <div className="meta">
              <span className="name">Marko Despotović</span>
              <span className="handle">@marko_d</span>
            </div>
          </div>
          <div className="scene-cli-create">
            <span className="plus">+</span>
            Create &ldquo;Anna&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}
