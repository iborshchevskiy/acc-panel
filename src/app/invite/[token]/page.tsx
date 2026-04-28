import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { db } from "@/db/client";
import { pendingInvites, organizationMembers, organizations } from "@/db/schema/system";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import Link from "next/link";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

const ROLE_LABEL: Record<string, string> = {
  org_admin: "Admin",
  accountant: "Accountant",
  viewer: "Viewer",
};
const ROLE_DESC: Record<string, string> = {
  org_admin: "full access — manage members, settings, and all data",
  accountant: "import, create, and edit transactions",
  viewer: "read-only access to all data",
};

/* ────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

async function userExistsInAuth(email: string): Promise<boolean> {
  const rows = (await db.execute(
    sql`select 1 as exists from auth.users where lower(email) = ${email.toLowerCase()} limit 1`
  )) as unknown as Array<{ exists: number }>;
  return rows.length > 0;
}

async function loadInvite(token: string) {
  const [invite] = await db
    .select()
    .from(pendingInvites)
    .where(and(
      eq(pendingInvites.token, token),
      isNull(pendingInvites.acceptedAt),
      gt(pendingInvites.expiresAt, new Date()),
    ))
    .limit(1);
  return invite ?? null;
}

async function joinOrg(orgId: string, role: string, userId: string, userEmail: string, inviteId: string, invitedBy: string | null) {
  const [existing] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.isActive, true),
    ))
    .limit(1);

  if (!existing) {
    await db.insert(organizationMembers).values({
      organizationId: orgId,
      userId,
      email: userEmail,
      role,
      invitedBy: invitedBy ?? undefined,
      acceptedAt: new Date(),
    });
  }

  await db.update(pendingInvites).set({ acceptedAt: new Date() })
    .where(eq(pendingInvites.id, inviteId));

  await logAudit({
    organizationId: orgId,
    userId,
    userEmail,
    action: "member_accepted_invite",
    entityType: "member",
    details: { email: userEmail, role },
  });
}

/* ────────────────────────────────────────────────────────────────────────
   Server actions
   ──────────────────────────────────────────────────────────────────────── */

async function acceptAsCurrentUser(token: string) {
  "use server";
  const invite = await loadInvite(token);
  if (!invite) redirect("/invite/expired");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  await joinOrg(invite.organizationId, invite.role, user.id, user.email ?? invite.email, invite.id, invite.invitedBy);
  revalidatePath("/app/settings");
  redirect("/app/dashboard");
}

async function acceptAsNewUser(token: string, formData: FormData) {
  "use server";
  const invite = await loadInvite(token);
  if (!invite) redirect("/invite/expired");

  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirm_password") as string) ?? "";
  if (!password || password.length < 6) {
    redirect(`/invite/${token}?error=${encodeURIComponent("Password must be at least 6 characters")}`);
  }
  if (password !== confirm) {
    redirect(`/invite/${token}?error=${encodeURIComponent("Passwords do not match")}`);
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    redirect(`/invite/${token}?error=${encodeURIComponent(createErr?.message ?? "Could not create account")}`);
  }

  // Sign the new user in
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) {
    redirect(`/login?error=${encodeURIComponent(signInErr.message)}`);
  }

  await joinOrg(invite.organizationId, invite.role, created.user.id, invite.email, invite.id, invite.invitedBy);
  revalidatePath("/app/settings");
  redirect("/app/dashboard");
}

async function acceptAsExistingUser(token: string, formData: FormData) {
  "use server";
  const invite = await loadInvite(token);
  if (!invite) redirect("/invite/expired");

  const password = (formData.get("password") as string) ?? "";
  if (!password) {
    redirect(`/invite/${token}?error=${encodeURIComponent("Password required")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (error || !data.user) {
    redirect(`/invite/${token}?error=${encodeURIComponent("Wrong password — try again or use 'forgot password' on the login page.")}`);
  }

  await joinOrg(invite.organizationId, invite.role, data.user.id, invite.email, invite.id, invite.invitedBy);
  revalidatePath("/app/settings");
  redirect("/app/dashboard");
}

/* ────────────────────────────────────────────────────────────────────────
   UI primitives
   ──────────────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        (props.className ?? "") +
        " w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
      }
    />
  );
}
function PrimaryBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-emerald-400 active:bg-emerald-600"
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────── */

export default async function InvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { error } = await searchParams;

  const invite = await loadInvite(token);
  if (!invite) {
    return (
      <Shell>
        <Header eyebrow="Invite" title="Link is invalid or expired" />
        <p className="text-sm text-zinc-400 text-center">
          Ask the person who invited you for a fresh link. Invites are valid for 7 days.
        </p>
      </Shell>
    );
  }

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);

  const orgName = org?.name ?? "an organisation";
  const roleLabel = ROLE_LABEL[invite.role] ?? invite.role;
  const roleDesc = ROLE_DESC[invite.role] ?? "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Path A: signed in under the SAME email — one-click join ───────────
  if (user && user.email?.toLowerCase() === invite.email.toLowerCase()) {
    const action = acceptAsCurrentUser.bind(null, token);
    // Already a member? bounce to dashboard.
    const [existing] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, invite.organizationId),
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.isActive, true),
      ))
      .limit(1);
    if (existing) redirect("/app/dashboard");

    return (
      <Shell>
        <Header eyebrow="You've been invited" title={`Join ${orgName}`} />
        <RoleChip role={roleLabel} desc={roleDesc} />
        <p className="text-xs text-zinc-500 text-center mt-4">
          Signed in as <span className="text-zinc-300">{user.email}</span>
        </p>
        <form action={action} className="mt-5 space-y-3">
          <PrimaryBtn>Join {orgName}</PrimaryBtn>
        </form>
      </Shell>
    );
  }

  // ── Path B: signed in under a DIFFERENT email — warn + sign out ───────
  if (user && user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Shell>
        <Header eyebrow="Wrong account" title={`Invite is for ${invite.email}`} />
        <p className="text-sm text-zinc-400 leading-relaxed text-center">
          You&apos;re currently signed in as{" "}
          <span className="text-zinc-200">{user.email}</span>. Sign out and
          re-open this link, or ask the inviter to send a new invite to your
          current address.
        </p>
        <form action="/api/auth/signout" method="POST" className="mt-6">
          <PrimaryBtn>Sign out</PrimaryBtn>
        </form>
      </Shell>
    );
  }

  // ── Not signed in. Decide between sign-in and set-password. ───────────
  const isExistingUser = await userExistsInAuth(invite.email);

  return (
    <Shell>
      <Header eyebrow="You've been invited" title={`Join ${orgName}`} />
      <RoleChip role={roleLabel} desc={roleDesc} />

      {error && (
        <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isExistingUser ? (
        <form action={acceptAsExistingUser.bind(null, token)} className="mt-6 space-y-4">
          <Field label="Email">
            <Input type="email" defaultValue={invite.email} disabled />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              autoFocus
            />
          </Field>
          <PrimaryBtn>Sign in &amp; join {orgName}</PrimaryBtn>
          <p className="text-center text-xs text-zinc-500">
            We recognise <span className="text-zinc-300">{invite.email}</span>.
            Enter your existing password to accept the invite.
          </p>
        </form>
      ) : (
        <form action={acceptAsNewUser.bind(null, token)} className="mt-6 space-y-4">
          <Field label="Email">
            <Input type="email" defaultValue={invite.email} disabled />
          </Field>
          <Field label="Set a password">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={6}
              required
              autoFocus
            />
          </Field>
          <Field label="Confirm password">
            <Input
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              minLength={6}
              required
            />
          </Field>
          <PrimaryBtn>Create account &amp; join</PrimaryBtn>
          <p className="text-center text-xs text-zinc-500">
            Your account is created with <span className="text-zinc-300">{invite.email}</span>.
            No verification email is sent — you&apos;ll be signed in immediately.
          </p>
        </form>
      )}

      <div className="mt-6 pt-4 text-center text-[11px] text-zinc-600 border-t border-zinc-800">
        Trying to start your own organisation instead?{" "}
        <Link href="/signup" className="text-emerald-500 hover:text-emerald-400">
          Self sign-up
        </Link>
      </div>
    </Shell>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Layout & header — match the auth-pages aesthetic
   ──────────────────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg, #0f1117)" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <span className="text-emerald-400 font-bold text-xl leading-none select-none">₿</span>
          </div>
          <span className="text-zinc-100 font-semibold text-lg tracking-tight">AccPanel</span>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-xl shadow-black/40">
          {children}
        </div>
      </div>
    </div>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-400">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-100">
        {title}
      </h1>
    </header>
  );
}

function RoleChip({ role, desc }: { role: string; desc: string }) {
  return (
    <div className="mt-5 flex flex-col items-center gap-1.5">
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        Role · {role}
      </span>
      <p className="text-xs text-zinc-500 text-center max-w-[280px] leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
