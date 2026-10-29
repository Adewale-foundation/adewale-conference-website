import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import RegisterSW from "@/components/pwa/register-sw";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const viewport: Viewport = {
  themeColor: "#0A0F1E",
  // Let the PWA draw under the notch/home-indicator so safe-area insets apply.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ASC Portal", statusBarStyle: "default" },
  // Favicon + apple-touch icon come from the src/app/icon.png and
  // src/app/apple-icon.png file conventions (auto-linked site-wide).
  title: {
    default: "Adewale Students Conference",
    template: "%s | Adewale Students Conference",
  },
  description:
    "Ogun State's flagship STEM competition for senior secondary students — building tomorrow's geniuses today.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {/* Registers the service worker site-wide (prod only) so the PWA is
            installable on the public site too, not just the portal. */}
        <RegisterSW />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
