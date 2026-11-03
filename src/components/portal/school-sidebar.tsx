"use client";

import {
  LayoutDashboard,
  ClipboardList,
  Users,
  ListChecks,
  Award,
  FolderDown,
  Settings,
  Tent,
  Ticket,
} from "lucide-react";
import PortalSidebar, { type SidebarConfig, type NavLink } from "@/components/portal/portal-sidebar";

const OVERVIEW: NavLink = { href: "/portal/school", label: "Overview", icon: LayoutDashboard, exact: true, short: "Home" };
const REGISTRATIONS: NavLink = { href: "/portal/school/registrations", label: "Registrations", icon: ClipboardList, short: "Regs" };
const STUDENTS: NavLink = { href: "/portal/school/students", label: "Students", icon: Users };
const PLANS: NavLink = { href: "/portal/school/plans", label: "Learning plans", icon: ListChecks, short: "Plans" };
const RESULTS: NavLink = { href: "/portal/school/results", label: "Results", icon: Award };
const RESOURCES: NavLink = { href: "/portal/school/resources", label: "Resources", icon: FolderDown };
const CAMP: NavLink = { href: "/portal/school/camp", label: "ASC Camp", icon: Tent, short: "Camp" };
const FINALE: NavLink = { href: "/portal/school/finale", label: "Grand Finale", icon: Ticket, short: "Finale" };
const SETTINGS: NavLink = { href: "/portal/school/settings", label: "Settings", icon: Settings };

// Camp only appears for schools invited to it (qualified for the Grand Finale);
// the Grand Finale link only while invitations are open.
function config(showCamp: boolean, showFinale: boolean): SidebarConfig {
  const camp = showCamp ? [CAMP] : [];
  const finale = showFinale ? [FINALE] : [];
  // The phone bar holds four; whatever doesn't fit moves to "More".
  const ordered = [OVERVIEW, ...finale, ...camp, REGISTRATIONS, STUDENTS, PLANS];
  return {
    ariaLabel: "School sections",
    overview: OVERVIEW,
    groups: [
      { title: "Manage", links: [...finale, ...camp, REGISTRATIONS, STUDENTS, PLANS, RESULTS, RESOURCES] },
      { title: "You", links: [SETTINGS] },
    ],
    bottom: ordered.slice(0, 4),
    more: [...ordered.slice(4), RESULTS, RESOURCES, SETTINGS],
  };
}

export default function SchoolSidebar({ showCamp = false, showFinale = false }: { showCamp?: boolean; showFinale?: boolean }) {
  return <PortalSidebar config={config(showCamp, showFinale)} />;
}
