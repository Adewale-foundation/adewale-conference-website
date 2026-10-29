import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Don't reuse a dynamic page's client-cached RSC on soft navigation. Sibling
  // dynamic routes share the /labs/[slug] segment, so without this a jump from
  // one lab to another showed the previous lab's content until a hard refresh.
  experimental: {
    staleTimes: { dynamic: 0 },
    // Server Actions default to a 1 MB request body, which silently rejected any
    // file upload above it (the resources form has always advertised 50 MB).
    // Raise it to the largest attachment/resource we accept.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Allow HMR / dev resources when testing from a phone on the LAN (e.g. the PWA).
  // Dev-only; add your machine's current LAN IP if it changes.
  allowedDevOrigins: ["192.168.100.14"],
  // Sanity Studio packages must load as real Node modules, not be bundled by
  // Turbopack — bundling them breaks React context at build time.
  serverExternalPackages: ["sanity", "@sanity/vision", "styled-components"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
  },
  // Ensure the email HTML templates are traced into the serverless route
  // handlers that read them at runtime.
  outputFileTracingIncludes: {
    "/api/registration": ["./src/emails/**/*"],
    "/api/sponsorship": ["./src/emails/**/*"],
    "/api/fellows": ["./src/emails/**/*"],
    "/portal/admin/editions": ["./src/emails/**/*"],
    "/portal/admin/announcements": ["./src/emails/**/*"],
    "/portal/admin/attendance": ["./src/emails/**/*"],
    // The fan vote's share images read their font files at runtime.
    "/finale/**": ["./assets/fonts/**/*"],
  },
  // The Fellows page was briefly published as /volunteer before the programme was
  // branded; keep any link already shared working.
  async redirects() {
    return [{ source: "/volunteer", destination: "/fellows", permanent: true }];
  },
  // Let the service worker control the whole origin, and keep it uncached so a
  // new release's sw.js is picked up promptly.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
