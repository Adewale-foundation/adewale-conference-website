// Central metadata for the admin permissions system: which modules exist, what
// they're called, which admin routes belong to each module, and the labels for
// the preset roles + access levels. Client-safe (no server-only imports) so both
// the server (pages, actions, layout) and the client (sidebar, settings UI) can
// share one source of truth.
//
// The permission *types* and preset *permission maps* live in @/supabase/types;
// this file adds the human-facing + routing metadata around them.

import type {
  AccessLevel,
  AdminPermissionsMap,
  AdminRolePreset,
  PermissionModule,
} from "@/supabase/types";
import {
  DEFAULT_EMPTY_PERMISSIONS,
  DEFAULT_SUPER_ADMIN_PERMISSIONS,
  PRESET_ROLE_PERMISSIONS,
} from "@/supabase/types";

const ACCESS_LEVELS: AccessLevel[] = ["none", "view", "manage"];

/**
 * The effective permissions map for a stored (admin_role, permissions) pair —
 * the pure mirror of getAdminPermissions used wherever we hold another admin's
 * row (recipient filtering, the settings roster): a null map or a "super_admin"
 * role means full access; a partial map is filled in with "none".
 */
export function resolveStoredPermissions(
  adminRole: string | null | undefined,
  permissions: AdminPermissionsMap | null | undefined,
): AdminPermissionsMap {
  if (!permissions || adminRole === "super_admin") return DEFAULT_SUPER_ADMIN_PERMISSIONS;
  return { ...DEFAULT_EMPTY_PERMISSIONS, ...permissions };
}

/** Canonical module order — drives the settings matrix and any iteration. */
export const PERMISSION_MODULES: PermissionModule[] = [
  "registrations",
  "participants",
  "content",
  "announcements",
  "labs",
  "analytics",
  "team",
];

export const MODULE_LABELS: Record<PermissionModule, string> = {
  team: "Team & Settings",
  registrations: "Registrations & Schools",
  participants: "Participants & Swaps",
  content: "Academic Content",
  announcements: "Announcements",
  labs: "Tech Labs & Challenges",
  analytics: "Analytics & Insights",
};

/** One-line description of what each module covers, shown in the settings matrix. */
export const MODULE_DESCRIPTIONS: Record<PermissionModule, string> = {
  team: "Team members, invites, sponsors and site settings",
  registrations: "Registrations, waitlist, editions, schools, replacements",
  participants: "Participant rosters, advancement, certificates",
  content: "Assessments, question bank, resources",
  announcements: "Broadcasts to educators by email and in-portal",
  labs: "Tech labs, challenges, workbench submissions",
  analytics: "Analytics charts and registration statistics",
};

/**
 * Modules whose only meaningful level is view — a "manage" toggle is pointless
 * because there are no write actions. Analytics is read-only data.
 */
export const VIEW_ONLY_MODULES: ReadonlySet<PermissionModule> = new Set(["analytics"]);

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: "None",
  view: "Read-only",
  manage: "Manage",
};

/** Badge text shown when a page/section is rendered in a restricted mode. */
export const ACCESS_LEVEL_BADGES: Record<AccessLevel, string> = {
  none: "Hidden",
  view: "Read-only",
  manage: "Full access",
};

export const PRESET_LABELS: Record<AdminRolePreset, string> = {
  super_admin: "Super Admin",
  operations: "Operations Manager",
  academic: "Academic / Content Manager",
  lab_manager: "Tech Lab Manager",
  viewer: "Viewer / Observer",
  custom: "Custom",
};

export const PRESET_ORDER: AdminRolePreset[] = [
  "super_admin",
  "operations",
  "academic",
  "lab_manager",
  "viewer",
  "custom",
];

// ── Route → module mapping ────────────────────────────────────────────────────
// Longest-prefix wins. Routes not listed here (e.g. /portal/admin itself, the
// sponsors page) are open to every admin — they're either the shared landing or
// carry no sensitive per-module data.
const ROUTE_MODULES: { prefix: string; module: PermissionModule }[] = [
  { prefix: "/portal/admin/analytics", module: "analytics" },
  { prefix: "/portal/admin/registrations", module: "registrations" },
  { prefix: "/portal/admin/waitlist", module: "registrations" },
  { prefix: "/portal/admin/editions", module: "registrations" },
  { prefix: "/portal/admin/schools", module: "registrations" },
  { prefix: "/portal/admin/participants", module: "participants" },
  { prefix: "/portal/admin/attendance", module: "participants" },
  { prefix: "/portal/admin/finale", module: "participants" },
  { prefix: "/portal/admin/replacements", module: "participants" },
  { prefix: "/portal/admin/paper-exams", module: "participants" },
  { prefix: "/portal/admin/papers", module: "participants" },
  { prefix: "/portal/admin/info-changes", module: "registrations" },
  { prefix: "/portal/admin/assessments", module: "content" },
  { prefix: "/portal/admin/question-bank", module: "content" },
  { prefix: "/portal/admin/resources", module: "content" },
  { prefix: "/portal/admin/announcements", module: "announcements" },
  { prefix: "/portal/admin/labs", module: "labs" },
  { prefix: "/portal/admin/challenges", module: "labs" },
  { prefix: "/portal/admin/users", module: "team" },
  { prefix: "/portal/admin/settings", module: "team" },
];

/** The module a given admin path belongs to, or null if it's open to all admins. */
export function moduleForPath(pathname: string): PermissionModule | null {
  let best: { prefix: string; module: PermissionModule } | null = null;
  for (const entry of ROUTE_MODULES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best?.module ?? null;
}

export function canView(perms: AdminPermissionsMap, module: PermissionModule): boolean {
  return perms[module] === "view" || perms[module] === "manage";
}

export function canManage(perms: AdminPermissionsMap, module: PermissionModule): boolean {
  return perms[module] === "manage";
}

/**
 * Which preset (if any) a permissions map matches exactly — otherwise "custom".
 * Used by the settings UI to label a saved/edited configuration.
 */
export function matchPreset(perms: AdminPermissionsMap): AdminRolePreset {
  for (const [preset, map] of Object.entries(PRESET_ROLE_PERMISSIONS)) {
    if (PERMISSION_MODULES.every((m) => map[m] === perms[m])) {
      return preset as AdminRolePreset;
    }
  }
  return "custom";
}

/** Compact human summary of a permissions map, e.g. "Registrations: Manage • Content: Read-only". */
export function summarizePermissions(perms: AdminPermissionsMap): string {
  const parts = PERMISSION_MODULES.filter((m) => perms[m] !== "none").map(
    (m) => `${MODULE_LABELS[m].split(" ")[0]}: ${ACCESS_LEVEL_LABELS[perms[m]]}`,
  );
  return parts.length ? parts.join(" • ") : "No module access";
}

function coerceLevel(value: string): AccessLevel {
  return (ACCESS_LEVELS as string[]).includes(value) ? (value as AccessLevel) : "none";
}

/**
 * Read a preset + per-module levels out of a submitted invite/edit form. A named
 * preset fills the whole map; "custom" reads each `perm_<module>` field. The
 * returned `adminRole` is re-derived from the resulting map so an all-manage
 * custom selection is stored as super_admin (full access), etc.
 */
export function permissionsFromForm(formData: FormData): {
  adminRole: AdminRolePreset;
  permissions: AdminPermissionsMap;
} {
  const preset = String(formData.get("preset") ?? "custom") as AdminRolePreset;
  if (preset !== "custom" && preset in PRESET_ROLE_PERMISSIONS) {
    const permissions = PRESET_ROLE_PERMISSIONS[preset as Exclude<AdminRolePreset, "custom">];
    return { adminRole: preset, permissions };
  }
  const permissions: AdminPermissionsMap = { ...DEFAULT_EMPTY_PERMISSIONS };
  for (const m of PERMISSION_MODULES) {
    permissions[m] = coerceLevel(String(formData.get(`perm_${m}`) ?? "none"));
  }
  return { adminRole: matchPreset(permissions), permissions };
}
