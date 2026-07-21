import type { Metadata, Viewport } from "next";
import { Unbounded } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "@/lib/providers";
import "./globals.css";

// Brand face (user 2026-07-15): Unbounded is now the WHOLE type system —
// headings, labels, body and every number — matching the marketing content.
// Loaded as the VARIABLE font (no `weight` list) so the full 200–900 axis is
// available: light for captions/labels, heavy for values and headings.
// (Supersedes the earlier 700/900-only wordmark rule.)
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://minepea.com"),
  title: "PEA",
  description: "A digital store of value. Mine and stake PEA.",
  // Social share card (WhatsApp/Discord/X link previews). The banner
  // lives at public/og-banner.png; without it crawlers fall back to
  // text-only previews.
  openGraph: {
    title: "PEA",
    description: "A digital store of value. Mine and stake PEA.",
    url: "https://minepea.com",
    siteName: "PEA",
    images: [{ url: "/og-banner.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-banner.png"],
  },
};

// viewport-fit=cover makes the env(safe-area-inset-*) values non-zero on
// notched phones — without it the BottomNav's safe-area padding is inert
// (audit finding). themeColor matches --color-bg.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* Skip link: the first focusable element, so a keyboard or
              screen-reader user can jump past the header and nav straight
              to the page. Hidden until focused. */}
          <a
            href="#main"
            className="sr-only rounded-full bg-accent px-5 py-2 text-[13px] font-bold uppercase tracking-[0.14em] text-on-light focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]"
          >
            Skip to content
          </a>
          <Header />
          <main
            id="main"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col outline-none"
          >
            {children}
          </main>
          {/* Footer carries the mobile bottom padding that clears the fixed
              BottomNav (h-16 + safe area) — it's last in the column now. */}
          <Footer />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
