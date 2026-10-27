import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CommerceProvider } from "@/providers/commerce-provider";
import { CommerceOverlays } from "@/components/cart/commerce-overlays";
import "./globals.css";
import "./commerce.css";

const display = localFont({
  src: "../../public/fonts/manrope-latin.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "200 800",
});
const body = localFont({
  src: "../../public/fonts/dm-sans-latin.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "100 1000",
});

export const metadata: Metadata = {
  title: { default: "Shopthie — Technology, thoughtfully chosen.", template: "%s · Shopthie" },
  description:
    "A considered edit of sound, connection, and everyday technology. Explore Shopthie’s interactive frontend demonstration.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${body.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <CommerceProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
          <CommerceOverlays />
        </CommerceProvider>
      </body>
    </html>
  );
}
