import type { Metadata } from "next";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "Agent Hub";

export const CORE_KEYWORDS = [
  "ai coding agent generator",
  "github copilot instructions generator",
  "claude code CLAUDE.md generator",
  "cursor rules generator",
  "windsurfrules generator",
  "clinerules generator",
  "AGENTS.md generator",
  "ai agent config for developers",
];

export function pageMetadata(opts: { title: string; description: string; path: string; keywords?: string[] }): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    keywords: [...(opts.keywords ?? []), ...CORE_KEYWORDS],
    alternates: { canonical: url },
    openGraph: { title: opts.title, description: opts.description, url, siteName: SITE_NAME, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
  };
}

// ---------- JSON-LD builders ----------
export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
});

export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: "Generate stack-specific AI coding agent configuration for GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Continue.dev, Aider and AGENTS.md.",
});

export const softwareAppLd = (opts: { name: string; description: string; path: string; category?: string; keywords: string[] }) => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: opts.name,
  url: `${SITE_URL}${opts.path}`,
  description: opts.description,
  applicationCategory: opts.category ?? "DeveloperApplication",
  operatingSystem: "Any (web browser)",
  browserRequirements: "Requires JavaScript",
  keywords: opts.keywords.join(", "),
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
});

export const faqLd = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});
