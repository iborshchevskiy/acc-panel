/**
 * Email delivery via Resend.
 * Set RESEND_API_KEY in env. Set RESEND_FROM to your verified sender address.
 * Without RESEND_API_KEY, emails are silently skipped (dev/test mode).
 */
import { Resend } from "resend";
import { db } from "@/db/client";
import { organizations } from "@/db/schema/system";
import { eq } from "drizzle-orm";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
const FROM = process.env.RESEND_FROM ?? "AccPanel <noreply@accpanel.app>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export type SendResult = "sent" | "skipped" | "error";

export async function sendInviteEmail({
  email,
  token,
  orgId,
  inviterEmail,
}: {
  email: string;
  token: string;
  orgId: string;
  inviterEmail: string;
}): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — invite email not delivered to", email);
    return "skipped";
  }

  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const orgName = org?.name ?? "an organisation";
  const inviteUrl = `${SITE_URL}/invite/${token}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `You've been invited to join ${orgName} on AccPanel`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #07090c; color: #e2e8f0; border-radius: 12px;">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #e2e8f0;">You've been invited</h2>
          <p style="color: #94a3b8; margin: 0 0 8px;">
            <strong style="color: #e2e8f0;">${inviterEmail}</strong> invited you to join
            <strong style="color: #10b981;">${orgName}</strong> on AccPanel.
          </p>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">
            This invite is valid for 7 days.
          </p>
          <a href="${inviteUrl}"
            style="display: inline-block; padding: 10px 24px; background: #10b981; color: #0d1117; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Accept invite
          </a>
          <p style="color: #334155; font-size: 12px; margin: 24px 0 0;">
            Or copy this link: <span style="color: #475569;">${inviteUrl}</span>
          </p>
        </div>
      `,
    });
    if (error) {
      console.error("[email] Resend rejected invite to", email, error);
      return "error";
    }
    return "sent";
  } catch (err) {
    console.error("[email] Resend threw sending invite to", email, err);
    return "error";
  }
}

export async function sendWelcomeEmail({
  email,
  orgName,
}: {
  email: string;
  orgName: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Welcome to AccPanel — ${orgName} is ready`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #07090c; color: #e2e8f0; border-radius: 12px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #e2e8f0;">Welcome to AccPanel</h2>
        <p style="color: #94a3b8;">
          Your organisation <strong style="color: #10b981;">${orgName}</strong> is ready.
          Start by adding wallets and importing transactions.
        </p>
        <a href="${SITE_URL}/app/dashboard"
          style="display: inline-block; margin-top: 24px; padding: 10px 24px; background: #10b981; color: #0d1117; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Go to dashboard
        </a>
      </div>
    `,
  });
}
