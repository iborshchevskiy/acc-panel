import type { ReactNode } from "react";

/** Apple-style mini "window" that frames each animated demo. */
export function Stage({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"help-stage " + (className ?? "")}>
      <div className="help-stage-bar">
        <span className="help-stage-dot" />
        <span className="help-stage-dot" />
        <span className="help-stage-dot" />
        {title ? <span className="help-stage-title">{title}</span> : null}
      </div>
      <div className="help-sheen" aria-hidden />
      {children}
    </div>
  );
}

/** Numbered list block in Apple-style — large numerals, generous spacing. */
export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="mt-10 flex flex-col gap-7">
      {items.map((s, i) => (
        <li key={i} className="grid grid-cols-[28px_1fr] items-baseline gap-4">
          <span
            className="font-mono text-xs tabular-nums"
            style={{ color: "var(--text-4)" }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <p className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
              {s.title}
            </p>
            <div
              className="mt-1.5 help-prose"
              style={{ fontSize: 14, color: "var(--text-3)" }}
            >
              {s.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Apple-style large display heading + dek. */
export function Headline({
  eyebrow,
  title,
  dek,
}: {
  eyebrow?: string;
  title: string;
  dek?: ReactNode;
}) {
  return (
    <header className="pt-12 pb-10">
      {eyebrow ? (
        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--accent)" }}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        className="text-[36px] sm:text-[44px] font-semibold leading-[1.05] tracking-tight"
        style={{ color: "var(--text-1)" }}
      >
        {title}
      </h1>
      {dek ? (
        <p
          className="mt-5 max-w-xl text-[17px] leading-relaxed"
          style={{ color: "var(--text-3)" }}
        >
          {dek}
        </p>
      ) : null}
    </header>
  );
}

/** Section divider — a quiet ruled line with a section eyebrow. */
export function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-20">
      {eyebrow ? (
        <p
          className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em]"
          style={{ color: "var(--text-3)" }}
        >
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2
          className="text-[24px] sm:text-[28px] font-semibold tracking-tight"
          style={{ color: "var(--text-1)" }}
        >
          {title}
        </h2>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Inline note callout — soft and subtle. */
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const accent = tone === "warn" ? "var(--amber)" : "var(--accent)";
  const bg =
    tone === "warn"
      ? "color-mix(in srgb, var(--amber) 8%, transparent)"
      : "var(--accent-lo)";
  return (
    <div
      className="my-7 rounded-xl px-5 py-4 text-sm leading-relaxed"
      style={{
        backgroundColor: bg,
        border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
        color: "var(--text-2)",
      }}
    >
      <span
        className="mr-2 font-semibold uppercase tracking-wider"
        style={{ color: accent, fontSize: 10 }}
      >
        {tone === "warn" ? "Heads up" : "Note"}
      </span>
      {children}
    </div>
  );
}

/** Tiny back-link used at the top of detail pages. */
export function BackLink() {
  return (
    <a
      href="/app/help"
      className="inline-flex items-center gap-1.5 text-xs"
      style={{ color: "var(--text-3)" }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M6.5 2L3 5l3.5 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      All topics
    </a>
  );
}
