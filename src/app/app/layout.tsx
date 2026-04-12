import { redirect } from "next/navigation";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import { db } from "@/db/client";
import { organizationMembers } from "@/db/schema/system";
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
  void params; // satisfy Next.js layout signature

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Guard: redirect to onboarding if user has no org membership
  // Wrapped in try/catch so missing DATABASE_URL doesn't crash during local dev setup
  try {
    const memberships = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);

    if (memberships.length === 0) {
      redirect("/app/onboarding");
    }
  } catch {
    // DB not configured yet — allow through so the app shell is visible
  }

  const userEmail = user.email ?? "";

  return (
    <div
      className={`${dmSans.variable} ${ibmPlexMono.variable} flex h-screen overflow-hidden font-[family-name:var(--font-dm-sans)]`}
      style={{ backgroundColor: "#0f1117" }}
    >
      <Sidebar userEmail={userEmail} />
      <main
        className="flex flex-1 flex-col overflow-y-auto"
        style={{ backgroundColor: "#0f1117" }}
      >
        {children}
      </main>
    </div>
  );
}
