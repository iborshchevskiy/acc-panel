"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001")
  );
}

export async function login(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/app");
}

export async function loginWithMagicLink(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?magic=sent");
}

export async function signup(formData: FormData): Promise<void> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm_password") as string;
  const inviteCode = ((formData.get("invite_code") as string) ?? "").trim();

  if (!email || !password) {
    redirect("/signup?error=Email+and+password+required");
  }
  if (password !== confirm) {
    redirect("/signup?error=Passwords+do+not+match");
  }

  // Closed-beta gate. If SIGNUP_INVITE_CODE is set, require an exact match.
  // If unset, signup is open (e.g. local dev).
  const requiredCode = process.env.SIGNUP_INVITE_CODE;
  if (requiredCode && inviteCode !== requiredCode) {
    redirect("/signup?error=Invalid+invite+code");
  }

  // Create the user with email_confirm:true — skips the verification email
  // entirely. Closed-beta phase: no SMTP / Supabase template setup needed.
  const admin = createAdminClient();
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    redirect(`/signup?error=${encodeURIComponent(createErr.message)}`);
  }

  // Establish a session for the freshly-created user.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    redirect(`/login?error=${encodeURIComponent(signInErr.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/app");
}
