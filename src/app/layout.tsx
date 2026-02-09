import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Exo_2, Manrope } from "next/font/google";
import { ThemeSync } from "@/components/theme/theme-sync";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  display: "swap",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"]
});

const exo2 = Exo_2({
  variable: "--font-display",
  display: "swap",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Moddyland Canvas Tasks",
  description: "Візуальний task manager для напрямків онлайн-магазину",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Moddyland Tasks"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a"
};

const themeInitScript = `
  (() => {
    try {
      const key = "moddyland:theme";
      const raw = window.localStorage.getItem(key);
      const mode = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
      const resolved = mode === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : mode;
      const root = document.documentElement;
      root.classList.remove("theme-dark", "theme-light", "dark");
      root.classList.add(resolved === "dark" ? "theme-dark" : "theme-light");
      if (resolved === "dark") root.classList.add("dark");
      root.style.colorScheme = resolved;
      root.dataset.themeMode = mode;
    } catch {}
  })();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body className={`${manrope.variable} ${exo2.variable} font-sans`}>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
