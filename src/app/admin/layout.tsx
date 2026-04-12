import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// System admin access: set SYSTEM_ADMIN_IDS=uuid1,uuid2 in env
const SYSTEM_ADMIN_IDS = new Set(
  (process.env.SYSTEM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !SYSTEM_ADMIN_IDS.has(user.id)) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg)", fontFamily: "var(--font-dm-sans, sans-serif)" }}>
      {/* Admin sidebar */}
      <aside className="w-52 shrink-0 border-r flex flex-col pt-8 pb-6 px-4"
        style={{ borderColor: "#1a0a0a", backgroundColor: "#0a0505" }}>
        <div className="mb-8 px-2">
          <p className="text-xs font-mono font-bold tracking-widest uppercase" style={{ color: "var(--red)" }}>SYSTEM ADMIN</p>
          <p className="text-xs mt-1 truncate" style={{ color: "var(--text-3)" }}>{user.email}</p>
        </div>
        <nav className="flex flex-col gap-0.5">
          {[
            { href: "/admin", label: "Overview" },
            { href: "/admin/orgs", label: "Organizations" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/health", label: "Health" },
          ].map(({ href, label }) => (
            <a key={href} href={href}
              className="flex items-center px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{ color: "var(--red)", opacity: 0.7 }}>
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-auto pt-4">
          <a href="/app/dashboard" className="text-xs px-3" style={{ color: "var(--inner-border)" }}>
            ← Back to app
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
