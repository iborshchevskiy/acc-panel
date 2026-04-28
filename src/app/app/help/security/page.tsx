import Link from "next/link";
import { Headline, Section, Note, BackLink } from "../_components/Stage";

export const metadata = { title: "Security & lock · Help" };

export default function SecurityHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Operations · Security"
        title="Lock it. Walk away."
        dek="The matrix-key PIN protects against shoulder-surfing — every time you unlock, the digit positions shuffle. Set it once, then lock the panel with a hotkey or the panic button."
      />

      <Section eyebrow="Set the PIN" title="">
        <ol className="mt-6 flex flex-col gap-4 text-[14px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          <li>
            <strong>1.</strong> Go to{" "}
            <Link
              href="/app/settings?tab=security"
              className="underline-offset-2 hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Settings → Security
            </Link>
            .
          </li>
          <li>
            <strong>2.</strong> Tap the <em>Set PIN</em> tile and enter a
            4-digit code, twice. The PIN is stored hashed; it can&rsquo;t be
            recovered, only reset.
          </li>
          <li>
            <strong>3.</strong> Optionally set an autolock timeout. Default is
            5 minutes of inactivity.
          </li>
        </ol>
      </Section>

      <Section eyebrow="Locking" title="Three ways, all instant.">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile
            label="Hotkey"
            body="Cmd+L on macOS, Ctrl+L on Windows / Linux. Works from any page."
          />
          <Tile
            label="Panic button"
            body="The big circular lock at the centre of the mobile bottom bar, or in the user popover on desktop."
          />
          <Tile
            label="Autolock"
            body="Idle past your configured threshold and the lock screen appears automatically."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Unlocking" title="The matrix is the trick.">
        <p className="help-prose">
          The unlock screen shows a 4×3 grid of circular keys with the digits
          0–9 and two empty slots. The digit positions are <strong>shuffled
          on every unlock</strong>. Anyone watching your fingers from across
          the room can&rsquo;t reconstruct your PIN, because the keys aren&rsquo;t
          in the same place twice.
        </p>
        <Note tone="warn">
          If you forget the PIN, sign out and sign back in — the unlock state
          resets at session level. There is no password recovery for the PIN.
        </Note>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/settings", title: "Settings",  body: "Where the security tab lives." },
            { href: "/app/help/clients",  title: "Clients",   body: "KYC docs are exactly the kind of thing you want behind a lock." },
          ]}
        />
      </Section>
    </div>
  );
}

function Tile({ label, body, last }: { label: string; body: string; last?: boolean }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 px-5 py-4"
      style={last ? undefined : { borderBottom: "1px solid var(--inner-border)" }}
    >
      <p className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {label}
      </p>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
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
