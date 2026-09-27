import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE_NAME, SITE_URL, CORE_KEYWORDS, organizationLd, websiteLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Agent Hub — AI Coding Agent Configuration Generator",
    template: "%s | Agent Hub",
  },
  description:
    "Generate stack-specific AI coding agent configuration in your browser for GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider and AGENTS.md — one consolidated Master Agent enforcing 10 strict operating directives. Free, no sign-up, download as a zip.",
  applicationName: SITE_NAME,
  keywords: CORE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: SITE_URL },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: SITE_URL },
  category: "developer tools",
};

export const viewport: Viewport = { themeColor: "#08080b", width: "device-width", initialScale: 1 };

/** Runs before hydration so the theme is correct on first paint — no flash of the wrong palette. An
 * explicit past choice (localStorage) wins; otherwise prefers-color-scheme decides. */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("agent-hub-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
