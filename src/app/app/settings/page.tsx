import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { organizations, organizationMembers, pendingInvites, auditLogs } from "@/db/schema/system";
import { currencies, orgTransactionTypes } from "@/db/schema/wallets";
import { eq, asc, desc, and, isNull, sql } from "drizzle-orm";
import {
  updateOrgSettings, inviteMember, cancelInvite, changeMemberRole, removeMember,
  addCurrency, editCurrency, deleteCurrency,
  addTransactionType, editTransactionType, deleteTransactionType,
} from "./actions";
import SecurityTab from "./SecurityTab";
import CopyButton from "@/components/copy-button";
import { ThemePicker } from "@/components/ThemeManager";

interface PageProps { searchParams: Promise<{ tab?: string; auditPage?: string }> }

const TIMEZONES = [
  "UTC","Europe/London","Europe/Prague","Europe/Warsaw",
  "Europe/Kiev","Europe/Moscow","Asia/Dubai","Asia/Bangkok",
  "America/New_York","America/Los_Angeles",
];
const ROLES = ["org_admin","accountant","viewer"] as const;
const ROLE_LABEL: Record<string,string> = { org_admin:"Admin", accountant:"Accountant", viewer:"Viewer" };
const ROLE_DESC: Record<string,string> = {
  org_admin:  "Full access — manage members, settings, currencies, and all data.",
  accountant: "Can import, create, and edit transactions. Cannot manage members or settings.",
  viewer:     "Read-only access to all data. Cannot make any changes.",
};
const ROLE_COLOR: Record<string,{bg:string;fg:string}> = {
  org_admin:  { bg:"var(--green-chip-bg)",  fg:"var(--accent)" },
  accountant: { bg:"var(--blue-chip-bg)",  fg:"var(--blue)" },
  viewer:     { bg:"var(--slate-chip-bg)", fg:"var(--text-5)" },
};
const ACTION_LABEL: Record<string,string> = {
  org_settings_updated:"Updated org settings",
  invite_sent:"Sent invite",
  invite_cancelled:"Cancelled invite",
  member_role_changed:"Changed role",
  member_removed:"Removed member",
  member_accepted_invite:"Joined via invite",
  transaction_created:"Created transaction",
  transaction_updated:"Edited transaction",
  transaction_deleted:"Deleted transaction",
  bulk_type_set:"Bulk set type",
  bulk_client_assigned:"Bulk assigned client",
  bulk_deleted:"Bulk deleted",
};

const TABS = [
  { id:"general",    label:"General",     icon:"⚙" },
  { id:"members",    label:"Members",     icon:"◈" },
  { id:"currencies", label:"Currencies",  icon:"◎" },
  { id:"types",      label:"Tx Types",    icon:"◇" },
  { id:"appearance", label:"Appearance",  icon:"◐" },
  { id:"audit",      label:"Audit Log",   icon:"≡" },
  { id:"security",   label:"Security",    icon:"⚿" },
] as const;
type TabId = typeof TABS[number]["id"];

/* ── tiny shared primitives ───────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-widest uppercase mb-4"
      style={{ color:"var(--text-3)", letterSpacing:"0.12em" }}>
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs" style={{ color:"var(--text-4)" }}>{label}</label>
      {children}
    </div>
  );
}

function UnderlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "bg-transparent border-b pb-1 text-sm outline-none transition-colors",
        "text-slate-200 placeholder:text-slate-700",
        "focus:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed",
        props.className ?? "",
      ].join(" ")}
      style={{ borderColor:"var(--inner-border)", ...props.style }}
    />
  );
}

function UnderlineSelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <select
      {...rest}
      className="bg-transparent border-b pb-1 text-sm text-slate-200 outline-none transition-colors focus:border-emerald-500 disabled:opacity-30"
      style={{ borderColor:"var(--inner-border)" }}>
      {children}
    </select>
  );
}

function Chip({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.viewer;
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor:c.bg, color:c.fg }}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function SaveBtn({ label = "Save" }: { label?: string }) {
  return (
    <button type="submit"
      className="h-7 rounded px-3 text-xs font-medium transition-opacity hover:opacity-80 active:scale-95"
      style={{ backgroundColor:"var(--green-btn-bg)", color:"var(--accent)", border:"1px solid var(--green-btn-border)" }}>
      {label}
    </button>
  );
}

function GhostBtn({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <button type="submit"
      className={[
        "text-xs transition-colors",
        danger
          ? "text-red-400/50 hover:text-red-400"
          : "text-slate-500/50 hover:text-slate-400",
      ].join(" ")}>
      {label}
    </button>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */

export default async function SettingsPage({ searchParams }: PageProps) {
  const { tab: tabParam, auditPage: auditPageParam } = await searchParams;
  const activeTab: TabId = (TABS.find(t => t.id === tabParam)?.id ?? "general") as TabId;
  const AUDIT_PAGE_SIZE = 100;
  const auditPage = Math.max(1, parseInt(auditPageParam ?? "1", 10));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [membership] = await db
    .select({ id: organizationMembers.id, organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!membership) redirect("/onboarding");

  const orgId = membership.organizationId;
  const isAdmin = membership.role === "org_admin";

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  type InviteRow  = typeof pendingInvites.$inferSelect;
  type LogRow     = typeof auditLogs.$inferSelect;
  type MemberRow  = { id:string; userId:string; email:string|null; role:string; acceptedAt:Date|null; createdAt:Date };

  const [currencyRows, txTypes, members, invites, logs, [{ count: auditTotal }]] = await Promise.all([
    db.select().from(currencies).where(eq(currencies.organizationId, orgId)).orderBy(asc(currencies.type), asc(currencies.code)),
    db.select().from(orgTransactionTypes).where(eq(orgTransactionTypes.organizationId, orgId)).orderBy(asc(orgTransactionTypes.name)),
    db.select({ id:organizationMembers.id, userId:organizationMembers.userId, email:organizationMembers.email, role:organizationMembers.role, acceptedAt:organizationMembers.acceptedAt, createdAt:organizationMembers.createdAt })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.isActive, true)))
      .orderBy(asc(organizationMembers.createdAt)) as Promise<MemberRow[]>,
    (isAdmin
      ? db.select().from(pendingInvites).where(and(eq(pendingInvites.organizationId, orgId), isNull(pendingInvites.acceptedAt))).orderBy(desc(pendingInvites.createdAt))
      : Promise.resolve([])) as Promise<InviteRow[]>,
    db.select().from(auditLogs).where(eq(auditLogs.organizationId, orgId)).orderBy(desc(auditLogs.createdAt)).limit(AUDIT_PAGE_SIZE).offset((auditPage - 1) * AUDIT_PAGE_SIZE) as Promise<LogRow[]>,
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(eq(auditLogs.organizationId, orgId)),
  ]);

  const enrichedMembers = members.map(m => ({
    ...m,
    displayEmail: m.userId === user.id ? (user.email ?? m.userId) : (m.email ?? m.userId.slice(0,8)+"…"),
    isSelf: m.userId === user.id,
  }));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  const cryptoCurrencies = currencyRows.filter(c => c.type === "crypto");
  const fiatCurrencies   = currencyRows.filter(c => c.type === "fiat");

  return (
    <div className="flex flex-col md:flex-row md:h-full" style={{ backgroundColor:"var(--bg)" }}>

      {/* ── Mobile header + tab bar (md:hidden) ─────────────────────── */}
      <div className="md:hidden sticky top-0 z-20" style={{ backgroundColor:"var(--bg)", borderBottom:"1px solid var(--surface-lo)" }}>
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-base font-semibold text-slate-200 tracking-tight">Settings</h1>
          <p className="text-xs mt-0.5" style={{ color:"var(--text-3)" }}>{org.name}</p>
        </div>
        <nav className="flex gap-1.5 px-3 pb-3 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            return (
              <a key={tab.id} href={`?tab=${tab.id}`}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors"
                style={active
                  ? { backgroundColor:"var(--accent)", color:"var(--surface)" }
                  : { backgroundColor:"var(--surface)", color:"var(--text-3)", border:"1px solid var(--surface-lo)" }}>
                {tab.label}
              </a>
            );
          })}
          <a href="/app/help"
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1"
            style={{ backgroundColor:"var(--surface)", color:"var(--accent)", border:"1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}>
            ? Help
          </a>
        </nav>
      </div>

      {/* ── Desktop left rail (hidden on mobile) ────────────────────── */}
      <aside className="hidden md:flex w-52 shrink-0 border-r flex-col pt-8 pb-6 px-4 sticky top-0 h-svh overflow-y-auto"
        style={{ borderColor:"var(--surface-lo)", backgroundColor:"var(--bg)" }}>

        <div className="mb-8 px-2">
          <h1 className="text-sm font-semibold text-slate-200 tracking-tight">Settings</h1>
          <p className="text-xs mt-0.5" style={{ color:"var(--text-3)" }}>{org.name}</p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {TABS.map((tab, idx) => {
            const active = tab.id === activeTab;
            return (
              <a key={tab.id} href={`?tab=${tab.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={active
                  ? { backgroundColor:"var(--green-alert-bg)", color:"var(--accent)", boxShadow:"inset 2px 0 0 var(--accent)" }
                  : { color:"var(--text-3)" }}>
                <span className="text-xs font-mono opacity-50">{String(idx+1).padStart(2,"0")}</span>
                <span className="font-medium">{tab.label}</span>
              </a>
            );
          })}
          <div className="my-2 mx-3" style={{ borderTop:"1px solid var(--surface-lo)" }} />
          <a href="/app/help"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
            style={{ color:"var(--text-3)" }}>
            <span className="text-xs font-mono opacity-50">?</span>
            <span className="font-medium">Help &amp; manual</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-auto">
              <path d="M2.5 7.5L7.5 2.5M7.5 2.5H3.5M7.5 2.5V6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </nav>

        {/* account card at bottom */}
        <div className="mt-auto pt-6 px-2">
          <div className="rounded-lg p-3" style={{ backgroundColor:"var(--surface)", border:"1px solid var(--surface-lo)" }}>
            <p className="text-xs truncate" style={{ color:"var(--text-4)" }}>{user.email}</p>
            <div className="mt-1.5">
              <Chip role={membership.role} />
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 md:overflow-y-auto">
        <div className="max-w-3xl px-4 py-6 md:px-10 md:py-10">

          {/* ── GENERAL ───────────────────────────────────────── */}
          {activeTab === "general" && (
            <section>
              <SectionLabel>Organisation</SectionLabel>
              <form action={updateOrgSettings}>
                <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-7">
                  <Field label="Organisation name">
                    <UnderlineInput name="name" defaultValue={org.name} required disabled={!isAdmin} />
                  </Field>
                  <Field label="Base currency">
                    <UnderlineInput name="base_currency" defaultValue={org.baseCurrency} required disabled={!isAdmin}
                      className="uppercase" style={{ borderColor:"var(--inner-border)" }} />
                  </Field>
                  <Field label="Timezone">
                    <UnderlineSelect name="timezone" defaultValue={org.timezone} disabled={!isAdmin}>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </UnderlineSelect>
                  </Field>
                  <Field label="Slug (read-only)">
                    <UnderlineInput value={org.slug} readOnly
                      className="font-mono cursor-not-allowed opacity-30" />
                  </Field>
                </div>
                {isAdmin && (
                  <div className="mt-8 flex items-center gap-3">
                    <SaveBtn label="Save changes" />
                    <span className="text-xs" style={{ color:"var(--inner-border)" }}>Changes apply immediately</span>
                  </div>
                )}
              </form>

              {/* org meta */}
              <div className="mt-12 pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                <SectionLabel>Organisation ID</SectionLabel>
                <p className="text-xs font-mono" style={{ color:"var(--text-3)" }}>{orgId}</p>
              </div>
            </section>
          )}

          {/* ── MEMBERS ───────────────────────────────────────── */}
          {activeTab === "members" && (
            <section>
              <div className="flex items-baseline justify-between mb-6">
                <SectionLabel>Team members</SectionLabel>
                <span className="text-xs" style={{ color:"var(--inner-border)" }}>{enrichedMembers.length} active</span>
              </div>

              {/* member rows */}
              <div className="flex flex-col divide-y" style={{ borderColor:"var(--surface-lo)" }}>
                {enrichedMembers.map(m => (
                  <div key={m.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                   <div className="flex items-center gap-3 sm:contents">
                    {/* avatar stub */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ backgroundColor:"var(--surface)", color:"var(--text-3)", border:"1px solid var(--surface-lo)" }}>
                      {(m.displayEmail?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate">
                        {m.displayEmail}
                        {m.isSelf && <span className="ml-2 text-xs" style={{ color:"var(--text-3)" }}>you</span>}
                      </p>
                      <p className="text-xs" style={{ color:"var(--text-3)" }}>
                        {(m.acceptedAt ?? m.createdAt) ? `Joined ${new Date((m.acceptedAt ?? m.createdAt)!).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                   </div>
                    <div className="shrink-0 flex flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-0.5">
                      {isAdmin && !m.isSelf ? (
                        <form action={changeMemberRole} className="flex items-center gap-2">
                          <input type="hidden" name="member_id" value={m.id} />
                          <UnderlineSelect name="role" defaultValue={m.role} className="text-xs py-0"
                            title={ROLE_DESC[m.role]}>
                            {ROLES.map(r => <option key={r} value={r} title={ROLE_DESC[r]}>{ROLE_LABEL[r]}</option>)}
                          </UnderlineSelect>
                          <SaveBtn label="Apply" />
                        </form>
                      ) : (
                        <Chip role={m.role} />
                      )}
                      <span className="hidden sm:inline text-xs max-w-[220px] text-right leading-snug" style={{ color:"var(--text-3)" }}>
                        {ROLE_DESC[m.role]}
                      </span>
                    </div>
                    {isAdmin && !m.isSelf && (
                      <form action={removeMember}>
                        <input type="hidden" name="member_id" value={m.id} />
                        <GhostBtn label="Remove" danger />
                      </form>
                    )}
                  </div>
                ))}
              </div>

              {/* pending invites */}
              {isAdmin && invites.length > 0 && (
                <div className="mt-10">
                  <SectionLabel>Pending invites</SectionLabel>
                  <div className="flex flex-col gap-2">
                    {invites.map(inv => {
                      const url = `${siteUrl}/invite/${inv.token}`;
                      return (
                        <div key={inv.id} className="flex flex-col gap-3 px-4 py-3 rounded-lg sm:flex-row sm:items-center sm:gap-4"
                          style={{ backgroundColor:"var(--surface)", border:"1px solid var(--surface-lo)" }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs text-slate-400">{inv.email}</p>
                              <Chip role={inv.role} />
                              <span className="text-xs" style={{ color:"var(--text-3)" }}>
                                exp. {new Date(inv.expiresAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs mt-1 font-mono truncate" style={{ color:"var(--inner-border)" }}>
                              {url}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <CopyButton value={url} label="Copy link" />
                            <form action={cancelInvite}>
                              <input type="hidden" name="invite_id" value={inv.id} />
                              <GhostBtn label="Cancel" danger />
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* invite form */}
              {isAdmin && (
                <div className="mt-10 pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                  <SectionLabel>Invite member</SectionLabel>
                  <form action={inviteMember} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                    <Field label="Email address">
                      <UnderlineInput name="email" type="email" placeholder="user@example.com" required className="w-full sm:w-64" />
                    </Field>
                    <Field label="Role">
                      <UnderlineSelect name="role" defaultValue="accountant">
                        {ROLES.map(r => <option key={r} value={r} title={ROLE_DESC[r]}>{ROLE_LABEL[r]}</option>)}
                      </UnderlineSelect>
                    </Field>
                    <SaveBtn label="Send invite" />
                  </form>
                  <p className="mt-3 text-xs" style={{ color:"var(--inner-border)" }}>
                    A shareable link will appear in pending invites. Valid 7 days.
                  </p>
                </div>
              )}

              {/* roles legend */}
              <div className="mt-10 pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                <SectionLabel>Role permissions</SectionLabel>
                <div className="flex flex-col gap-3">
                  {ROLES.map(r => {
                    const c = ROLE_COLOR[r];
                    return (
                      <div key={r} className="flex items-start gap-4">
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 mt-0.5"
                          style={{ backgroundColor:c.bg, color:c.fg }}>
                          {ROLE_LABEL[r]}
                        </span>
                        <span className="text-xs leading-relaxed" style={{ color:"var(--text-4)" }}>
                          {ROLE_DESC[r]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── CURRENCIES ────────────────────────────────────── */}
          {activeTab === "currencies" && (
            <section>
              {/* crypto */}
              <div className="mb-10">
                <div className="flex items-baseline justify-between mb-4">
                  <SectionLabel>Crypto</SectionLabel>
                  <span className="text-xs" style={{ color:"var(--inner-border)" }}>{cryptoCurrencies.length}</span>
                </div>
                <div className="flex flex-col divide-y" style={{ borderColor:"var(--surface-lo)" }}>
                  {cryptoCurrencies.map(c => (
                    <div key={c.id} className="flex items-center gap-4 py-2.5">
                      <span className="w-16 text-xs font-mono font-semibold" style={{ color:"var(--accent)" }}>{c.code}</span>
                      {isAdmin ? (
                        <form action={editCurrency} className="flex-1">
                          <input type="hidden" name="currency_id" value={c.id} />
                          <input type="hidden" name="type" value="crypto" />
                          <UnderlineInput name="name" defaultValue={c.name ?? ""} placeholder="Display name"
                            className="w-full text-xs" />
                        </form>
                      ) : (
                        <span className="flex-1 text-xs" style={{ color:"var(--text-3)" }}>{c.name ?? "—"}</span>
                      )}
                      {isAdmin && (
                        <form action={editCurrency} title="Move to fiat">
                          <input type="hidden" name="currency_id" value={c.id} />
                          <input type="hidden" name="type" value="fiat" />
                          <input type="hidden" name="name" value={c.name ?? ""} />
                          <GhostBtn label="→ fiat" />
                        </form>
                      )}
                      {isAdmin && (
                        <form action={deleteCurrency}>
                          <input type="hidden" name="currency_id" value={c.id} />
                          <GhostBtn label="×" danger />
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* fiat */}
              <div className="mb-10 pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                <div className="flex items-baseline justify-between mb-4">
                  <SectionLabel>Fiat</SectionLabel>
                  <span className="text-xs" style={{ color:"var(--inner-border)" }}>{fiatCurrencies.length}</span>
                </div>
                <div className="flex flex-col divide-y" style={{ borderColor:"var(--surface-lo)" }}>
                  {fiatCurrencies.map(c => (
                    <div key={c.id} className="flex items-center gap-4 py-2.5">
                      <span className="w-16 text-xs font-mono font-semibold" style={{ color:"var(--indigo)" }}>{c.code}</span>
                      {isAdmin ? (
                        <form action={editCurrency} className="flex-1">
                          <input type="hidden" name="currency_id" value={c.id} />
                          <input type="hidden" name="type" value="fiat" />
                          <UnderlineInput name="name" defaultValue={c.name ?? ""} placeholder="Display name"
                            className="w-full text-xs" />
                        </form>
                      ) : (
                        <span className="flex-1 text-xs" style={{ color:"var(--text-3)" }}>{c.name ?? "—"}</span>
                      )}
                      {isAdmin && (
                        <form action={editCurrency} title="Move to crypto">
                          <input type="hidden" name="currency_id" value={c.id} />
                          <input type="hidden" name="type" value="crypto" />
                          <input type="hidden" name="name" value={c.name ?? ""} />
                          <GhostBtn label="→ crypto" />
                        </form>
                      )}
                      {isAdmin && (
                        <form action={deleteCurrency}>
                          <input type="hidden" name="currency_id" value={c.id} />
                          <GhostBtn label="×" danger />
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* add form */}
              {isAdmin && (
                <div className="pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                  <SectionLabel>Add currency</SectionLabel>
                  <form action={addCurrency} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                    <Field label="Code">
                      <UnderlineInput name="code" placeholder="USDT" required maxLength={20}
                        className="w-full uppercase sm:w-20" />
                    </Field>
                    <Field label="Name (optional)">
                      <UnderlineInput name="name" placeholder="Tether USD" className="w-full sm:w-48" />
                    </Field>
                    <Field label="Type">
                      <UnderlineSelect name="type" defaultValue="crypto">
                        <option value="crypto">crypto</option>
                        <option value="fiat">fiat</option>
                      </UnderlineSelect>
                    </Field>
                    <SaveBtn label="Add" />
                  </form>
                  <p className="mt-3 text-xs" style={{ color:"var(--inner-border)" }}>
                    Currencies are also auto-added during blockchain and CSV imports.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── TRANSACTION TYPES ─────────────────────────────── */}
          {activeTab === "types" && (
            <section>
              <div className="flex items-baseline justify-between mb-6">
                <SectionLabel>Transaction types</SectionLabel>
                <span className="text-xs" style={{ color:"var(--inner-border)" }}>{txTypes.length} defined</span>
              </div>

              <div className="flex flex-col divide-y" style={{ borderColor:"var(--surface-lo)" }}>
                {txTypes.map(t => (
                  <div key={t.id} className="flex items-center gap-4 py-3">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor:"var(--text-3)" }} />
                    {isAdmin ? (
                      <form action={editTransactionType} className="flex items-center gap-3 flex-1">
                        <input type="hidden" name="type_id" value={t.id} />
                        <UnderlineInput name="name" defaultValue={t.name} required maxLength={50} className="flex-1 text-sm" />
                        <SaveBtn label="Rename" />
                      </form>
                    ) : (
                      <span className="flex-1 text-sm text-slate-300">{t.name}</span>
                    )}
                    {isAdmin && (
                      <form action={deleteTransactionType}>
                        <input type="hidden" name="type_id" value={t.id} />
                        <GhostBtn label="Delete" danger />
                      </form>
                    )}
                  </div>
                ))}
              </div>

              {isAdmin && (
                <div className="mt-10 pt-8 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                  <SectionLabel>New type</SectionLabel>
                  <form action={addTransactionType} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <Field label="Type name">
                      <UnderlineInput name="name" placeholder="e.g. Staking" required maxLength={50} className="w-full sm:w-56" />
                    </Field>
                    <SaveBtn label="Add type" />
                  </form>
                  <p className="mt-3 text-xs" style={{ color:"var(--inner-border)" }}>
                    Used to tag transactions for filtering, FIFO analysis, and P&L bucketing.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── APPEARANCE ────────────────────────────────────── */}
          {activeTab === "appearance" && (
            <section>
              <SectionLabel>Theme</SectionLabel>
              <p className="text-sm mb-6 max-w-md" style={{ color: "var(--text-3)" }}>
                Pick a palette. Your choice syncs across browsers and devices
                signed in with this account.
              </p>
              <ThemePicker />
              <p className="mt-6 text-xs" style={{ color: "var(--inner-border)" }}>
                Tap the theme button in the sidebar to cycle through quickly,
                or pick one here for a permanent setting.
              </p>
            </section>
          )}

          {/* ── AUDIT LOG ─────────────────────────────────────── */}
          {activeTab === "audit" && (() => {
            const auditTotalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
            return (
            <section>
              <div className="flex items-baseline justify-between mb-6">
                <SectionLabel>Activity log</SectionLabel>
                <span className="text-xs" style={{ color:"var(--inner-border)" }}>{auditTotal.toLocaleString()} total events</span>
              </div>

              {logs.length === 0 ? (
                <p className="text-xs" style={{ color:"var(--text-3)" }}>No activity recorded yet.</p>
              ) : (
                <div className="flex flex-col">
                  {logs.map((log, i) => {
                    let details: Record<string,string> = {};
                    try { details = JSON.parse(log.details ?? "{}"); } catch { /* */ }
                    const isLast = i === logs.length - 1;
                    const isTxAction = log.action.startsWith("transaction_");
                    const actionColor = log.action === "transaction_deleted"
                      ? "var(--red)"
                      : log.action === "transaction_created"
                      ? "var(--accent)"
                      : "var(--text-2)";
                    return (
                      <div key={log.id} className="flex gap-4">
                        {/* timeline */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full mt-[5px]"
                            style={{ backgroundColor: isTxAction ? actionColor : "var(--inner-border)" }} />
                          {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor:"var(--surface-lo)" }} />}
                        </div>
                        <div className="pb-5 flex-1 min-w-0">
                          {/* action + legs on one line */}
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-semibold" style={{ color: isTxAction ? actionColor : "var(--text-2)" }}>
                              {ACTION_LABEL[log.action] ?? log.action}
                            </span>
                            {details.type && details.type !== "—" && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor:"var(--raised-hi)", color:"var(--text-2)", border:"1px solid var(--inner-border)" }}>
                                {details.type}
                              </span>
                            )}
                            {details.legs && (
                              <span className="text-xs font-mono" style={{ color:"var(--text-1)" }}>
                                {details.legs}
                              </span>
                            )}
                          </div>
                          {/* secondary details row */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs font-medium" style={{ color:"var(--text-3)" }}>
                              {log.userEmail ?? (log.userId ? log.userId.slice(0,8)+"…" : "—")}
                            </span>
                            <span className="text-xs font-mono" style={{ color:"var(--inner-border)" }}>
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                            {details.tx && (
                              <span className="text-[10px] font-mono" style={{ color:"var(--text-3)" }}>
                                tx:{details.tx}…
                              </span>
                            )}
                            {details.date && (
                              <span className="text-[10px] font-mono" style={{ color:"var(--text-3)" }}>
                                {details.date}
                              </span>
                            )}
                            {details.client && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px]"
                                style={{ backgroundColor:"var(--blue-chip-bg)", color:"var(--blue)" }}>
                                {details.client}
                              </span>
                            )}
                            {details.comment && (
                              <span className="text-[10px] italic" style={{ color:"var(--text-3)" }}>
                                &ldquo;{details.comment}&rdquo;
                              </span>
                            )}
                            {/* fallback for non-tx actions */}
                            {!isTxAction && Object.keys(details).length > 0 && (
                              <span className="text-xs font-mono" style={{ color:"var(--text-3)" }}>
                                {Object.entries(details).map(([k,v]) => `${k}=${v}`).join("  ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Audit pagination */}
              {auditTotalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor:"var(--surface-lo)" }}>
                  <span className="text-xs" style={{ color:"var(--text-3)" }}>
                    Page {auditPage} of {auditTotalPages}
                  </span>
                  <div className="flex gap-1">
                    {auditPage > 1 && (
                      <a href={`?tab=audit&auditPage=${auditPage - 1}`}
                        className="h-7 px-3 flex items-center rounded text-xs transition-colors"
                        style={{ color:"var(--text-4)" }}>← Prev</a>
                    )}
                    {auditPage < auditTotalPages && (
                      <a href={`?tab=audit&auditPage=${auditPage + 1}`}
                        className="h-7 px-3 flex items-center rounded text-xs transition-colors"
                        style={{ color:"var(--text-4)" }}>Next →</a>
                    )}
                  </div>
                </div>
              )}
            </section>
            );
          })()}

          {/* ── SECURITY ──────────────────────────────────────── */}
          {activeTab === "security" && (
            <section>
              <SecurityTab />
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
