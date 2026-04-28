import "./help.css";
import Link from "next/link";

export const metadata = { title: "Help · AccPanel" };

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full" style={{ backgroundColor: "var(--bg)" }}>
      {children}
      <footer
        className="mt-24 px-6 pb-16 pt-8 text-center text-xs"
        style={{ color: "var(--text-4)", borderTop: "1px solid var(--inner-border)" }}
      >
        <p>Need something this guide doesn&rsquo;t cover?</p>
        <p className="mt-1">
          <Link href="/app/settings?tab=audit" className="underline-offset-2 hover:underline">
            Check the audit log
          </Link>
          {" · "}
          <Link href="/app/help" className="underline-offset-2 hover:underline">
            Back to all topics
          </Link>
        </p>
      </footer>
    </div>
  );
}
