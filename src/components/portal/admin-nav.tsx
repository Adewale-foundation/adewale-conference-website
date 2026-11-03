"use client";

import {
  LayoutDashboard,
  BarChart3,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  ContactRound,
  FileQuestion,
  FlaskConical,
  FolderDown,
  Hourglass,
  Megaphone,
  ScanLine,
  Trophy,
  Users,
  School,
  UserCheck,
  UserRound,
  UserRoundCheck,
  HandCoins,
  Settings,
  Ticket,
} from "lucide-react";
import PortalSidebar, { type SidebarConfig, type NavLink } from "@/components/portal/portal-sidebar";
import type { AdminPermissionsMap } from "@/supabase/types";
import { canView } from "@/lib/admin-permissions";

const OVERVIEW: NavLink = { href: "/portal/admin", label: "Overview", icon: LayoutDashboard, exact: true, short: "Home" };
const ANALYTICS: NavLink = { href: "/portal/admin/analytics", label: "Analytics", icon: BarChart3, short: "Stats", module: "analytics" };
const EDITIONS: NavLink = { href: "/portal/admin/editions", label: "Editions", icon: CalendarDays, module: "registrations" };
const REGISTRATIONS: NavLink = { href: "/portal/admin/registrations", label: "Registrations", icon: ClipboardList, short: "Regs", module: "registrations" };
const WAITLIST: NavLink = { href: "/portal/admin/waitlist", label: "Waitlist", icon: Hourglass, short: "Wait", module: "registrations" };
const ASSESSMENTS: NavLink = { href: "/portal/admin/assessments", label: "Assessments", icon: ClipboardCheck, short: "Tests", module: "content" };
const LABS: NavLink = { href: "/portal/admin/labs", label: "Labs", icon: FlaskConical, module: "labs" };
const CHALLENGES: NavLink = { href: "/portal/admin/challenges", label: "Challenges", icon: Trophy, short: "Arena", module: "labs" };
const QUESTION_BANK: NavLink = { href: "/portal/admin/question-bank", label: "Question bank", icon: FileQuestion, short: "Bank", module: "content" };
const RESOURCES: NavLink = { href: "/portal/admin/resources", label: "Resources", icon: FolderDown, short: "Guides", module: "content" };
const ANNOUNCEMENTS: NavLink = { href: "/portal/admin/announcements", label: "Announcements", icon: Megaphone, short: "News", module: "announcements" };
const USERS: NavLink = { href: "/portal/admin/users", label: "Users", icon: Users, module: "team" };
const SCHOOLS: NavLink = { href: "/portal/admin/schools", label: "Schools", icon: School, module: "registrations" };
const PARTICIPANTS: NavLink = { href: "/portal/admin/participants", label: "Participants", icon: UserRound, short: "People", module: "participants" };
const REPLACEMENTS: NavLink = { href: "/portal/admin/replacements", label: "Replacements", icon: UserRoundCheck, short: "Swaps", module: "registrations" };
const PAPER_EXAMS: NavLink = { href: "/portal/admin/paper-exams", label: "Paper exams", icon: ScanLine, short: "Paper", module: "participants" };
const GRAND_FINALE: NavLink = { href: "/portal/admin/finale", label: "Grand Finale", icon: Ticket, short: "Finale", module: "participants" };
const ATTENDANCE: NavLink = { href: "/portal/admin/attendance", label: "Attendance", icon: UserCheck, short: "Here", module: "participants" };
const INFO_CHANGES: NavLink = { href: "/portal/admin/info-changes", label: "Contact corrections", icon: ContactRound, short: "Fixes", module: "registrations" };
const SPONSORS: NavLink = { href: "/portal/admin/sponsors", label: "Sponsors", icon: HandCoins, module: "team" };
// Settings is always shown — it also hosts each admin's own account settings. The
// team-management + site-settings tabs inside it are gated by the "team" module.
const SETTINGS: NavLink = { href: "/portal/admin/settings", label: "Settings", icon: Settings };

const CONFIG: SidebarConfig = {
  ariaLabel: "Admin sections",
  overview: OVERVIEW,
  groups: [
    { title: "Insights", links: [ANALYTICS] },
    { title: "Program", links: [EDITIONS, REGISTRATIONS, WAITLIST, ANNOUNCEMENTS, ASSESSMENTS, LABS, CHALLENGES, QUESTION_BANK, RESOURCES] },
    { title: "People", links: [PARTICIPANTS, PAPER_EXAMS, ATTENDANCE, GRAND_FINALE, REPLACEMENTS, INFO_CHANGES, USERS, SCHOOLS, SPONSORS] },
    { title: "Site", links: [SETTINGS] },
  ],
  bottom: [OVERVIEW, ANALYTICS, REGISTRATIONS, USERS],
  more: [ANNOUNCEMENTS, ASSESSMENTS, PAPER_EXAMS, ATTENDANCE, GRAND_FINALE, PARTICIPANTS, REPLACEMENTS, INFO_CHANGES, EDITIONS, WAITLIST, LABS, CHALLENGES, QUESTION_BANK, RESOURCES, SCHOOLS, SPONSORS, SETTINGS],
};

// A link is shown when it has no module (always-open, e.g. Overview / Sponsors)
// or the admin has at least view access to its module. Backend page gates and
// server-action checks enforce the same rules — this just keeps the rail honest.
function visible(link: NavLink, perms: AdminPermissionsMap): boolean {
  return !link.module || canView(perms, link.module);
}

function filterConfig(config: SidebarConfig, perms: AdminPermissionsMap): SidebarConfig {
  const keep = (l: NavLink) => visible(l, perms);
  const bottom = config.bottom.filter(keep);
  const more = (config.more ?? []).filter(keep);
  return {
    ...config,
    groups: config.groups
      .map((g) => ({ ...g, links: g.links.filter(keep) }))
      .filter((g) => g.links.length > 0),
    // Overview always stays as a bottom tab so the mobile bar is never empty.
    bottom: bottom.length ? bottom : [config.overview],
    more,
  };
}

export default function AdminNav({ perms }: { perms: AdminPermissionsMap }) {
  return <PortalSidebar config={filterConfig(CONFIG, perms)} />;
}
