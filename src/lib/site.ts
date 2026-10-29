export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.adewaleconference.org";

// Canonical list of public platform pages. Drives the sitemap now, and will
// drive the primary navigation once each page carries real content.
export const PLATFORM_PAGES = [
  { path: "/", label: "Home" },
  { path: "/about", label: "About" },
  { path: "/editions", label: "Editions" },
  { path: "/results", label: "Hall of Fame" },
  { path: "/resources", label: "Resources" },
  { path: "/news", label: "News" },
  { path: "/gallery", label: "Gallery" },
  { path: "/schools", label: "Schools" },
  { path: "/sponsors", label: "Sponsors" },
  { path: "/fellows", label: "Fellows Programme" },
  { path: "/finale", label: "Grand Finale fan vote" },
  { path: "/faq", label: "FAQ" },
  { path: "/contact", label: "Contact" },
] as const;

export type PlatformPage = (typeof PLATFORM_PAGES)[number];

// Primary navigation. A flat entry renders as a plain link; a grouped entry
// renders as a dropdown on desktop and a labelled section in the mobile menu.
// Grouping is what keeps the bar short as the public site grows — add a new page
// to the group it belongs to rather than to the top level.
export const MAIN_NAV: readonly NavEntry[] = [
  {
    label: "About",
    items: [
      { label: "About ASC", href: "/about" },
      { label: "Editions", href: "/editions" },
      { label: "Hall of Fame", href: "/results" },
      { label: "Schools", href: "/schools" },
    ],
  },
  {
    label: "Get Involved",
    items: [
      { label: "Grand Finale fan vote", href: "/finale" },
      { label: "Fellows Programme", href: "/fellows" },
      { label: "Sponsors", href: "/sponsors" },
      { label: "Register a School", href: "/#register" },
    ],
  },
  {
    label: "Media",
    items: [
      { label: "News", href: "/news" },
      { label: "Gallery", href: "/gallery" },
    ],
  },
  { label: "Resources", href: "/resources" },
  {
    label: "Help",
    items: [
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

// Primary call-to-action. The registration experience lives on the home page
// (`#register`); `/#register` routes home and scrolls to it from any page.
export const NAV_CTA = { label: "Register", href: "/#register" } as const;

export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; items: readonly NavItem[] };
export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

/** Whether a nav href is the page currently being viewed. Section links (`/#x`)
 *  never count as active — they are anchors, not destinations. Real routes match
 *  their own children too, so `/editions/2025` still lights up "Editions". */
export function isNavItemActive(href: string, pathname: string) {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
