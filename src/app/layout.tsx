import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccPanel",
  description: "Crypto exchange office accounting — wallets, FIFO, clients, capital.",
  applicationName: "AccPanel",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AccPanel",
    // "default" keeps the iOS status bar opaque (no overlap with content).
    // Use "black-translucent" only if every page handles env(safe-area-inset-*).
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    // Next.js auto-discovers src/app/icon.tsx and src/app/apple-icon.tsx
    // and emits the right <link> tags. Listing them here is purely for
    // older crawlers / iOS Safari fallbacks.
    icon: [{ url: "/icon", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow content to extend into the iPad's rounded-corner safe areas
  // when running standalone — the body uses env(safe-area-inset-*) to
  // pad correctly (see globals.css).
  viewportFit: "cover",
  // Match dark and light themes so iOS picks the right status-bar tint.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07090c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
  ],
};

// Inline script runs before React hydration — prevents flash of wrong theme.
// Supported themes: dark (default), light, sepia, amber, plum.
const antiFlashScript = `
(function(){
  try {
    var t = localStorage.getItem('acc-theme');
    var allowed = { dark:1, light:1, sepia:1, amber:1, plum:1 };
    if (!t || !allowed[t]) t = 'dark';
    document.documentElement.classList.add(t);
  } catch(e){
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: antiFlashScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
