// Shared loading shell for every /app/* route. Renders instantly on
// navigation while the Server Component fetches DB data, so the click
// → screen transition feels native instead of frozen for ~1s on a
// remote PWA.

const block: React.CSSProperties = {
  backgroundColor: "var(--raised-hi)",
  borderRadius: 6,
};

function SkeletonRow({ widths }: { widths: number[] }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3"
      style={{ borderBottom: "1px solid var(--inner-border)" }}
    >
      {widths.map((w, i) => (
        <div key={i} className="animate-pulse" style={{ ...block, height: 12, width: `${w}%` }} />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="animate-pulse" style={{ ...block, height: 18, width: 140 }} />
          <div className="animate-pulse" style={{ ...block, height: 10, width: 80, opacity: 0.6 }} />
        </div>
        <div className="animate-pulse" style={{ ...block, height: 32, width: 96 }} />
      </div>

      {/* Card with filter bar + rows */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--inner-border)" }}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ backgroundColor: "var(--surface)", borderBottom: "1px solid var(--inner-border)" }}
        >
          <div className="animate-pulse" style={{ ...block, height: 28, width: 200 }} />
          <div className="animate-pulse" style={{ ...block, height: 28, width: 120, opacity: 0.7 }} />
        </div>

        <div style={{ backgroundColor: "var(--surface)" }}>
          {[
            [16, 8, 8, 14, 14, 8, 18, 14],
            [16, 8, 8, 12, 14, 8, 18, 14],
            [16, 8, 8, 14, 12, 8, 18, 14],
            [16, 8, 8, 12, 14, 8, 18, 14],
            [16, 8, 8, 14, 14, 8, 18, 14],
            [16, 8, 8, 12, 12, 8, 18, 14],
          ].map((widths, i) => (
            <SkeletonRow key={i} widths={widths} />
          ))}
        </div>
      </div>
    </div>
  );
}
