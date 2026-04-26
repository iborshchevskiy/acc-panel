import { redirect } from "next/navigation";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import FlashBanner from "@/components/flash-banner";
import LockProvider from "@/components/LockProvider";
import LockScreen from "@/components/LockScreen";
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

    if (!membership) {
      redirect("/onboarding");
    }

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, membership.organizationId))
      .limit(1);

    orgName = org?.name;
  } catch (err) {
    // Re-throw Next.js redirects — redirect() throws internally and must not be swallowed
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    // Otherwise DB not configured yet — render without org name
  }

  return (
    <LockProvider>
      <div
        className={`${dmSans.variable} ${ibmPlexMono.variable} flex h-screen overflow-hidden font-[family-name:var(--font-dm-sans)]`}
        style={{
          backgroundColor: "var(--bg)",
          // PWA standalone (iPad/iPhone): reserve the iOS status-bar height so
          // the sidebar and main content never slide under the system clock /
          // wi-fi / battery icons. No-op in regular browsers (env() → 0).
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <Sidebar userEmail={user.email ?? ""} orgName={orgName} />
        <main
          className="flex flex-1 flex-col overflow-y-auto"
          style={{
            backgroundColor: "var(--bg)",
            // PWA standalone: keep the last scroll item clear of the iOS home
            // indicator. No-op in regular browsers (env() falls back to 0).
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            overscrollBehavior: "none",
          }}
        >
          {children}
        </main>
        <FlashBanner />
      </div>
      <LockScreen />
    </LockProvider>
  );
}
