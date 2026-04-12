import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "var(--surface)" }}>
      <p className="font-[family-name:var(--font-ibm-plex-mono)] text-6xl font-medium text-slate-700">404</p>
      <p className="text-slate-400">Page not found</p>
      <Link href="/app/dashboard"
        className="mt-2 h-8 flex items-center rounded-md px-4 text-sm font-medium"
        style={{ backgroundColor: "var(--green-chip-bg)", color: "var(--accent)" }}>
        Back to dashboard
      </Link>
    </div>
  );
}
