import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/**
 * Per-page metadata helper. The root layout sets the title template
 * (`%s | Adewale Students Conference`) and metadataBase, so pages only supply a
 * short title + description and get consistent OpenGraph/Twitter tags for free.
 *
 * A page's `openGraph` replaces the root layout's whole object rather than
 * merging with it, so the site-wide fields are repeated here; Meta's sharing
 * debugger flags og:type and og:url as missing without them, and WhatsApp's
 * link previews are stricter than the debugger. `path` (e.g. "/finale")
 * becomes og:url against metadataBase.
 */
export function pageMetadata(title: string, description: string, path?: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: SITE_NAME, ...(path ? { url: path } : {}) },
    twitter: { title, description },
  };
}
