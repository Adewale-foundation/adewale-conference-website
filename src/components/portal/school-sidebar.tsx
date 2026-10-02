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
} from "lucide-react";
import PortalSidebar, { type SidebarConfig, type NavLink } from "@/components/portal/portal-sidebar";

const OVERVIEW: NavLink = { href: "/portal/school", label: "Overview", icon: LayoutDashboard, exact: true, short: "Home" };
const REGISTRATIONS: NavLink = { href: "/portal/school/registrations", label: "Registrations", icon: ClipboardList, short: "Regs" };
const STUDENTS: NavLink = { href: "/portal/school/students", label: "Students", icon: Users };
const PLANS: NavLink = { href: "/portal/school/plans", label: "Learning plans", icon: ListChecks, short: "Plans" };
const RESULTS: NavLink = { href: "/portal/school/results", label: "Results", icon: Award };
const RESOURCES: NavLink = { href: "/portal/school/resources", label: "Resources", icon: FolderDown };
const CAMP: NavLink = { href: "/portal/school/camp", label: "ASC Camp", icon: Tent, short: "Camp" };
const SETTINGS: NavLink = { href: "/portal/school/settings", label: "Settings", icon: Settings };

// Camp only appears for schools invited to it (qualified for the Grand Finale).
function config(showCamp: boolean): SidebarConfig {
  const camp = showCamp ? [CAMP] : [];
  return {
    ariaLabel: "School sections",
    overview: OVERVIEW,
    groups: [
      { title: "Manage", links: [...camp, REGISTRATIONS, STUDENTS, PLANS, RESULTS, RESOURCES] },
      { title: "You", links: [SETTINGS] },
    ],
    bottom: [OVERVIEW, ...camp, REGISTRATIONS, STUDENTS, ...(showCamp ? [] : [PLANS])],
    more: [...(showCamp ? [PLANS] : []), RESULTS, RESOURCES, SETTINGS],
  };
}

export default function SchoolSidebar({ showCamp = false }: { showCamp?: boolean }) {
  return <PortalSidebar config={config(showCamp)} />;
}
