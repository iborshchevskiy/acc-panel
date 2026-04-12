import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccPanel",
  description: "P2P crypto trading accounting panel",
};

// Inline script runs before React hydration — prevents flash of wrong theme
const antiFlashScript = `
(function(){
  try {
    var t = localStorage.getItem('acc-theme');
    if (t === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch(e){}
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
