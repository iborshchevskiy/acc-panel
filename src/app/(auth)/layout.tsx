import { DM_Sans } from "next/font/google";
import type { Metadata } from "next";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "AccPanel",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${dmSans.variable} font-[family-name:var(--font-dm-sans)] min-h-screen bg-[#0f1117] flex items-center justify-center px-4`}
    >
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <span className="text-emerald-400 font-bold text-xl leading-none select-none">
              ₿
            </span>
          </div>
          <span className="text-zinc-100 font-semibold text-lg tracking-tight">
            AccPanel
          </span>
          <span className="text-zinc-500 text-xs mt-0.5 tracking-wide">
            P2P TRADING ACCOUNTING
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl shadow-black/40">
          {children}
        </div>
      </div>
    </div>
  );
}
