import type { Metadata, Viewport } from "next";
import { Unbounded } from "next/font/google";
import "./globals.css";

// Same brand face as the main site: Unbounded as the variable font, so the
// full 200-900 weight axis is available and hierarchy comes from weight.
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PEA Art",
  description:
    "Art, memes, GIFs, and brand assets from the PEA community. Free to take, remix, and post.",
};

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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
