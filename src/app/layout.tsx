import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clauset — Local-First Agent Memory & Policy Mesh",
  description:
    "Offline-first semantic memory mesh, policy-enforced residency firewall, hybrid RRF recall, and split-brain conflict arbitration for autonomous agents.",
  icons: { icon: "/clauset-mark.svg" },
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem("clauset-theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || (!saved && prefersDark)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased selection:bg-blue-600/20 selection:text-blue-900 dark:selection:text-blue-100">
        {children}
      </body>
    </html>
  );
}
