export type UserRole = "student" | "coordinator" | "admin";

// ── Admin permissions (two-tier: view vs. manage, per module) ─────────────────
// Every admin is role="admin" in the DB, so RLS (is_admin()) can't distinguish
// these levels — enforcement lives in the application layer (server actions +
// UI). See src/lib/admin-permissions.ts for route↔module mapping and labels.
export type PermissionModule =
  | "team"
  | "registrations"
  | "participants"
  | "content"
  | "announcements"
  | "labs"
  | "analytics";

export type AccessLevel = "none" | "view" | "manage";

export type AdminPermissionsMap = Record<PermissionModule, AccessLevel>;

export type AdminRolePreset =
  | "super_admin"
  | "operations"
  | "academic"
  | "lab_manager"
  | "viewer"
  | "custom";

/** No access to anything — the safe default for a non-admin or missing profile. */
export const DEFAULT_EMPTY_PERMISSIONS: AdminPermissionsMap = {
  team: "none",
  registrations: "none",
  participants: "none",
  content: "none",
  announcements: "none",
  labs: "none",
  analytics: "none",
};

export const DEFAULT_SUPER_ADMIN_PERMISSIONS: AdminPermissionsMap = {
  team: "manage",
  registrations: "manage",
  participants: "manage",
  content: "manage",
  announcements: "manage",
  labs: "manage",
  analytics: "manage",
};

export const PRESET_ROLE_PERMISSIONS: Record<
  Exclude<AdminRolePreset, "custom">,
  AdminPermissionsMap
> = {
  super_admin: DEFAULT_SUPER_ADMIN_PERMISSIONS,
  operations: {
    team: "none",
    registrations: "manage",
    participants: "manage",
    content: "view",
    announcements: "manage",
    labs: "none",
    analytics: "view",
  },
  academic: {
    team: "none",
    registrations: "none",
    participants: "view",
    content: "manage",
    announcements: "view",
    labs: "none",
    analytics: "view",
  },
  lab_manager: {
    team: "none",
    registrations: "none",
    participants: "none",
    content: "view",
    announcements: "none",
    labs: "manage",
    analytics: "view",
  },
  viewer: {
    team: "none",
    registrations: "view",
    participants: "view",
    content: "view",
    announcements: "view",
    labs: "view",
    analytics: "view",
  },
};

// Registration status records ONLY the acceptance decision. Competition
// progress (past-zonals, finalist) lives in the stage-results tables and, for
// resource unlocks, is derived from stage advancement — see resource-access.ts.
export type RegistrationStatus =
  | "submitted"
  | "verified"
  | "declined";

// How a school fared at a single competition stage (the edition moves everyone
// through one shared stage list; this is the per-school result at each).
export type StageOutcome = "pending" | "advanced" | "eliminated";

export const COMPETITION_STAGES = [
  "Qualifications",
  "Grand Finale Group Stage",
  "Round of 16",
  "Quarter Finals",
  "Semi Finals",
  "Finals",
] as const;

export const OPTIONAL_COMPETITION_STAGES = ["Round of 24"] as const;

export const DEFAULT_EDITION_STAGES = [
  "Registration",
  "Qualifications",
  "Grand Finale Group Stage",
  "Round of 16",
  "Quarter Finals",
  "Semi Finals",
  "Finals",
  "Completed",
] as const;

export const QUALIFICATION_REASONS = [
  "Zonal Champion",
  "Top 10",
  "State-wide Qualification",
  "Divisional Qualification",
  "Wildcard",
  "Manual Selection",
  "Replacement",
] as const;

export type QualificationReason = (typeof QUALIFICATION_REASONS)[number];

// A qualified school's answer to the ASC Camp invitation. "pending" is a row an
// admin opened before the school answered; "released" means the spot was reassigned.
export type CampStatus = "pending" | "attending" | "not_attending" | "released";

export interface CampSettings {
  edition_year: number;
  title: string;
  venue: string | null;
  arrival_at: string | null;
  departure_at: string | null;
  confirm_deadline: string | null;
  whatsapp_url: string | null;
  is_open: boolean;
}

export interface CampConfirmation {
  id: string;
  registration_id: string;
  school_id: string;
  edition_year: number;
  status: CampStatus;
  /** Educators on record (going or not) plus any extras — see CampEducator in lib/camp. */
  educators: {
    name: string;
    phone: string | null;
    email: string | null;
    role: "teacher" | "principal" | "educator" | "extra";
    going: boolean;
  }[];
  reps_confirmed: boolean;
  notes: string | null;
  decline_reason: string | null;
  respond_by: string | null;
  admin_note: string | null;
  /** Added by an admin rather than qualifying — see camp_eligible(). */
  invited_manually: boolean;
  responded_at: string | null;
  updated_at: string;
}

export interface StageResult {
  id: string;
  registration_id: string;
  stage: string;
  outcome: StageOutcome;
  score: number | null;
  /** Denominator for `score` where the source has one. Null = a bare figure. */
  score_max?: number | null;
  note: string | null;
  reason?: string | null;
  lga_rank?: number | null;
  state_rank?: number | null;
  qualification_type?: string | null;
}

// The per-STUDENT mirror of StageResult — how one rep fared at a stage.
export interface StudentStageResult {
  id: string;
  student_id: string;
  stage: string;
  /** Part of the row's key: (student_id, stage, edition_year). */
  edition_year?: number | null;
  outcome: StageOutcome;
  score: number | null;
  score_max?: number | null;
  /** Per-subject scores where the source has them — a paper exam does. */
  breakdown?: SubjectBreakdown | null;
  note: string | null;
}

/** Per-subject scores, keyed exactly as paper_exams.subjects. */
export type SubjectBreakdown = Record<string, { correct: number; out_of: number }>;

export interface Certificate {
  id: string;
  type: string | null;
  asset_url: string | null;
}

export interface Rep {
  name: string;
  level?: string;
}

export type TournamentMatchKind = "group" | "knockout" | "face_off" | "bye";
export type TournamentMatchStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "needs_face_off"
  | "cancelled";

export interface TournamentGroup {
  id: string;
  edition_year: number;
  stage: string;
  name: string;
  sort_order: number;
  advance_count: number;
}

export interface TournamentGroupEntry {
  id: string;
  group_id: string;
  registration_id: string;
  seed: number | null;
  rank: number | null;
  score: number | null;
  note: string | null;
  advance_override: boolean | null;
}

export interface TournamentMatch {
  id: string;
  edition_year: number;
  stage: string;
  kind: TournamentMatchKind;
  team_a_registration_id: string | null;
  team_b_registration_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_registration_id: string | null;
  status: TournamentMatchStatus;
  scheduled_at: string | null;
  venue: string | null;
  note: string | null;
  parent_match_id: string | null;
  slot: number | null;
  superseded_at?: string | null;
}

export interface IndividualAward {
  id: string;
  edition_year: number;
  student_id: string;
  registration_id: string | null;
  stage: string | null;
  title: string;
  note: string | null;
}

export type ReplacementStatus = "pending" | "approved" | "declined";

/** Return shape of the requestReplacement server action (used by its dialog). */
export type ReplacementResult = { ok?: boolean; error?: string };

export interface StudentReplacementRow {
  id: string;
  registration_id: string;
  school_id: string;
  rep_slot: number | null;
  old_student_id: string | null;
  old_name: string;
  old_level: string | null;
  new_name: string;
  new_level: string | null;
  new_details: Record<string, string>;
  reason: string;
  status: ReplacementStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  schools?: { name: string | null } | null;
  registrations?: { edition_year: number | null } | null;
}

/** Return shape of the requestInfoChange server action (used by its dialog). */
export type InfoChangeResult = { ok?: boolean; error?: string };

export interface InfoChangeRequestRow {
  id: string;
  registration_id: string;
  school_id: string;
  target: "teacher" | "principal";
  new_name: string | null;
  new_phone: string | null;
  /** What approval overwrote, so a wrong one can be put back. */
  previous_name?: string | null;
  previous_phone?: string | null;
  reason: string;
  status: ReplacementStatus;
  admin_note: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  schools?: { name: string | null } | null;
}

export interface Edition {
  year: number;
  title: string | null;
  registration_open: boolean;
  stages: string[];
  current_stage: string;
}

export interface ParticipationRow {
  id: string;
  edition_year: number;
  status: RegistrationStatus;
  current_stage: string | null;
  schools: { name: string | null } | null;
}

export interface RegistrationWithRelations {
  id: string;
  edition_year: number;
  status: RegistrationStatus;
  decline_reason: string | null;
  reps: unknown;
  schools: { name: string | null; lga: string | null } | null;
  certificates: Certificate[];
}

export type AssessmentMode = "practice" | "exam";

export interface Assessment {
  id: string;
  title: string;
  subject: string | null;
  level: string | null;
  edition_year: number | null;
  published: boolean;
  mode?: AssessmentMode;
  max_attempts?: number;
  time_limit_minutes?: number | null;
  content_version?: number;
}
/** @deprecated use Assessment — kept for one release during the rename. */
export type Quiz = Assessment;

// ── paper exam ──────────────────────────────────────────────────────────────
// A Paper Exam is NOT an Assessment: see
// docs/adr/0009-paper-qualifying-exam-as-its-own-domain.md.

export type PaperExamStatus = "draft" | "printed" | "grading" | "published";

export interface PaperExam {
  id: string;
  edition_year: number;
  stage: string;
  title: string;
  item_count: number;
  /** Bubbles per question: 4 (A-D) or 5 (A-E). Both sheets are in use. */
  option_count: number;
  /** A deliberate import of a past sitting, exempt from the past-edition lock. */
  is_backfill: boolean;
  /** This exam's own ordered subject vocabulary; these become breakdown keys. */
  subjects: string[];
  source_quiz_name: string | null;
  school_score_rule: "sum_all" | "sum_top_n" | "mean_present" | "best";
  school_score_top_n: number;
  /** Until this is set, per-item correct answers never leave the server. */
  review_released: boolean;
  status: PaperExamStatus;
  /** The one exam per edition the centre-lead pages mark against. */
  attendance_open?: boolean;
  created_at?: string;
}

export interface PaperExamItem {
  id: string;
  exam_id: string;
  version: string;
  position: number;
  subject: string;
  correct: string;
}

export type PaperStatus = "matched" | "unmatched" | "ambiguous" | "duplicate" | "discarded";

export interface PaperExamPaper {
  id: string;
  exam_id: string;
  import_id: string;
  external_id: string | null;
  exam_no: string | null;
  first_name: string | null;
  last_name: string | null;
  class_name: string | null;
  version: string;
  version_assumed: boolean;
  responses: (string | null)[];
  total: number | null;
  attempted: number | null;
  invalid_marks: number;
  subscores: SubjectBreakdown | null;
  capture_num_correct: number | null;
  key_mismatches: number | null;
  /** The number matched but the sheet's name is somebody else. */
  name_mismatch: boolean;
  student_id: string | null;
  match_method: string | null;
  status: PaperStatus;
  resolution_note: string | null;
  /** When this paper's score reached student_stage_results. An import publishes
   *  in more than one pass, so it is per-paper rather than per-import. */
  published_at?: string | null;
}

export interface PaperExamImport {
  id: string;
  exam_id: string;
  source: "zipgrade_csv" | "in_app_scanner";
  filename: string | null;
  header_map: Record<string, unknown> | null;
  row_count: number;
  matched_count: number;
  undecided_count: number;
  error_count: number;
  key_mismatch_count: number;
  status: "staged" | "committed" | "discarded";
  created_at: string;
  committed_at: string | null;
}

// ── exam centres and attendance ─────────────────────────────────────────────

export interface ExamCentre {
  id: string;
  edition_year: number;
  /** The host school. */
  name: string;
  town: string;
  /** The ZONAL_FINALS_OPTIONS town this venue serves, or null for a venue no
   *  stored qualification_zone can reach (Arigbajo, Imeko). */
  legacy_zone: string | null;
  is_active: boolean;
}

export const CENTRE_LEAD_ROLES = ["centre_lead", "invigilator", "materials_officer"] as const;
export type CentreLeadRole = (typeof CENTRE_LEAD_ROLES)[number];

export const CENTRE_LEAD_ROLE_LABELS: Record<CentreLeadRole, string> = {
  centre_lead: "Centre Lead",
  invigilator: "Invigilator",
  materials_officer: "Registration & Materials Officer",
};

export interface CentreLead {
  id: string;
  edition_year: number;
  centre_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: CentreLeadRole;
  is_active: boolean;
  last_signed_in_at: string | null;
  last_emailed_at?: string | null;
  created_at?: string;
}

export type AttendanceStatus = "present" | "absent";

export interface AttendanceRow {
  id: string;
  exam_id: string;
  student_id: string;
  centre_id: string;
  status: AttendanceStatus;
  marked_by_lead: string | null;
  marked_by_profile: string | null;
  marked_at: string;
  note: string | null;
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position?: number;
  mode?: AssessmentMode;
  subject?: string | null;
  level?: string | null;
  topic?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  explanation?: string | null;
}
/** @deprecated use Question — kept for one release during the rename. */
export type QuizQuestion = Question;

export interface AdminRegistrationRow {
  id: string;
  edition_year: number;
  status: RegistrationStatus;
  decline_reason: string | null;
  claim_code: string | null;
  contact_email: string | null;
  contact_name: string | null;
  onboarded_at: string | null;
  provisioned_count: number | null;
  reps: unknown;
  /** Full entry keyed by Airtable field names (genders, DOBs, guardians, contacts). */
  details: Record<string, string> | null;
  schools: { name: string | null } | null;
  profiles: { email: string | null; full_name: string | null } | null;
  certificates: { id: string; type: string | null }[];
}
