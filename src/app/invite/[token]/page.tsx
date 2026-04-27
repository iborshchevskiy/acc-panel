import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { pendingInvites, organizationMembers, organizations } from "@/db/schema/system";
import { eq, and, isNull, gt } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function acceptInvite(inviteId: string, orgId: string, role: string, userId: string, userEmail: string) {
  "use server";

  const [invite] = await db.select().from(pendingInvites)
    .where(and(
      eq(pendingInvites.id, inviteId),
      isNull(pendingInvites.acceptedAt),
      gt(pendingInvites.expiresAt, new Date()),
    ))
    .limit(1);

  if (!invite) redirect("/invite/expired");

  const [existing] = await db.select({ id: organizationMembers.id })
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
      invitedBy: invite.invitedBy,
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

  revalidatePath("/app/settings");
  redirect("/app/dashboard");
}

function AcceptForm({ inviteId, orgId, role, userId, userEmail, orgName }: {
  inviteId: string; orgId: string; role: string;
  userId: string; userEmail: string; orgName: string;
}) {
  const action = acceptInvite.bind(null, inviteId, orgId, role, userId, userEmail);
  return (
    <form action={action}>
      <p className="text-xs text-slate-600 text-center mb-4">
        Joining as: <span className="text-slate-400">{userEmail}</span>
      </p>
      <button type="submit"
        className="w-full h-10 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--accent)", color: "var(--surface)" }}>
        Join {orgName}
      </button>
      <a href="/app/dashboard"
        className="mt-3 block text-center text-xs text-slate-600 hover:text-slate-400 transition-colors">
        Decline
      </a>
    </form>
  );
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const [invite] = await db.select().from(pendingInvites)
    .where(and(
      eq(pendingInvites.token, token),
      isNull(pendingInvites.acceptedAt),
      gt(pendingInvites.expiresAt, new Date()),
    ))
    .limit(1);

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg)" }}>
        <div className="rounded-xl p-5 text-center max-w-md w-full sm:p-8"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--inner-border)" }}>
          <div className="text-3xl mb-4">⚠️</div>
          <h1 className="text-lg font-semibold text-slate-100 mb-2">Invite not found</h1>
          <p className="text-sm text-slate-500">This invite link is invalid or has expired.</p>
          <a href="/app/dashboard" className="mt-6 inline-block text-sm text-emerald-500 hover:underline">
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  const [existing] = await db.select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(
      eq(organizationMembers.organizationId, invite.organizationId),
      eq(organizationMembers.userId, user.id),
      eq(organizationMembers.isActive, true),
    ))
    .limit(1);

  if (existing) {
    redirect("/app/dashboard");
  }

  const [org] = await db.select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="rounded-xl p-5 max-w-md w-full sm:p-8"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--inner-border)" }}>
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
            style={{ backgroundColor: "var(--green-chip-bg)" }}>
            <svg className="w-6 h-6" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-100">You&apos;ve been invited</h1>
          <p className="text-sm text-slate-500 mt-1">
            Join <span className="text-slate-300 font-medium">{org?.name ?? "an organisation"}</span> as{" "}
            <span className="text-slate-300 font-medium capitalize">{invite.role.replace("_", " ")}</span>
          </p>
          <p className="text-xs text-slate-600 mt-1">Invited for: {invite.email}</p>
        </div>

        <AcceptForm
          inviteId={invite.id}
          orgId={invite.organizationId}
          role={invite.role}
          userId={user.id}
          userEmail={user.email ?? ""}
          orgName={org?.name ?? ""}
        />
      </div>
    </div>
  );
}
