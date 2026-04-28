import Link from "next/link";
import { Headline, Section, BackLink } from "../_components/Stage";

export const metadata = { title: "Settings · Help" };

export default function SettingsHelpPage() {
  return (
    <div className="mx-auto max-w-[760px] px-6">
      <div className="pt-10">
        <BackLink />
      </div>

      <Headline
        eyebrow="Operations · Settings"
        title="Tune the org without touching the database."
        dek="Seven tabs, one page. Each tab does exactly one thing — name your org, manage members, define currencies, watch the audit log, lock the panel."
      />

      <Section eyebrow="Tabs at a glance" title="">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <Tile
            href="/app/settings?tab=general"
            label="General"
            body="Organisation name, base currency, timezone. Slug is read-only — it's part of every shareable link."
          />
          <Tile
            href="/app/settings?tab=members"
            label="Members"
            body="Invite, change role, remove. Invites are signed links; valid 7 days. Roles: Admin, Accountant, Viewer."
          />
          <Tile
            href="/app/settings?tab=currencies"
            label="Currencies"
            body="Supported codes for legs. Crypto and Fiat are tracked separately. New codes are also auto-added during imports."
          />
          <Tile
            href="/app/settings?tab=types"
            label="Tx Types"
            body="Custom labels you can attach to transactions. Drives both the type pill colour and the FIFO bucket."
          />
          <Tile
            href="/app/settings?tab=appearance"
            label="Appearance"
            body="Five themes: Midnight, Snow, Sepia, Amber, Plum. Sync across devices via your account."
          />
          <Tile
            href="/app/settings?tab=audit"
            label="Audit Log"
            body="Every meaningful event with who, what, and when. Paginated, 100 events per page."
          />
          <Tile
            href="/app/settings?tab=security"
            label="Security"
            body="Set your matrix-key PIN, autolock timer, and lock the panel right now."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Roles" title="Three levels, no hidden permissions.">
        <div className="rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <RoleRow
            color="var(--accent)"
            label="Admin"
            body="Everything. Manage members, currencies, types, all data."
          />
          <RoleRow
            color="var(--blue)"
            label="Accountant"
            body="Import, create, edit transactions. Cannot manage members or org settings."
          />
          <RoleRow
            color="var(--text-5)"
            label="Viewer"
            body="Read-only. Useful for auditors or external accountants."
            last
          />
        </div>
      </Section>

      <Section eyebrow="Related" title="See also">
        <RelatedGrid
          items={[
            { href: "/app/help/security", title: "Security & lock", body: "Matrix-key PIN, autolock, panic button." },
            { href: "/app/help/dashboard", title: "Dashboard",      body: "What the org settings do to the displayed numbers." },
          ]}
        />
      </Section>
    </div>
  );
}

function Tile({ href, label, body, last }: { href: string; label: string; body: string; last?: boolean }) {
  return (
    <Link
      href={href}
      className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 px-5 py-4 transition-colors"
      style={last ? undefined : { borderBottom: "1px solid var(--inner-border)" }}
    >
      <p className="text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
        {label}
      </p>
      <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {body}
      </p>
    </Link>
  );
}

function RoleRow({
  color,
  label,
  body,
  last,
}: {
  color: string;
  label: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-4 px-5 py-4"
      style={last ? undefined : { borderBottom: "1px solid var(--inner-border)" }}
    >
      <span
        className="mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}
      >
        {label}
      </span>
      <p className="flex-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
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
