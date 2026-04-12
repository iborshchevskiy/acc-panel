import { redirect } from "next/navigation";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import { db } from "@/db/client";
import { organizationMembers, organizations } from "@/db/schema/system";
import { eq } from "drizzle-orm";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Record<string, string>>;
}) {
  void params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let orgName: string | undefined;

  try {
    const [membership] = await db
      .select({ id: organizationMembers.id, organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);

    if (!membership) redirect("/app/onboarding");

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, membership.organizationId))
      .limit(1);

    orgName = org?.name;
  } catch {
    // DB not configured yet
  }

  return (
    <div
      className={`${dmSans.variable} ${ibmPlexMono.variable} flex h-screen overflow-hidden font-[family-name:var(--font-dm-sans)]`}
      style={{ backgroundColor: "#0f1117" }}
    >
      <Sidebar userEmail={user.email ?? ""} orgName={orgName} />
      <main className="flex flex-1 flex-col overflow-y-auto" style={{ backgroundColor: "#0f1117" }}>
        {children}
      </main>
    </div>
  );
}
