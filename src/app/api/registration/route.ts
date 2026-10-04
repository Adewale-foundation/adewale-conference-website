import { otherSchoolFor } from "@/lib/educator-school";
import { NextResponse } from "next/server";
import {
  createAirtableRecord,
  getParticipantsTableId,
  getSchoolDatabaseTableId,
  findSchoolByNameCategoryLga,
  isAirtableWritesEnabled,
} from "@/lib/airtable";
import {
  CLASS_OPTIONS,
  GENDER_OPTIONS,
  LGA_OPTIONS,
  mapRegistrationFields,
  type RegistrationFormData,
  SCHOOL_CATEGORY_OPTIONS,
  YES_NO_OPTIONS,
  ZONAL_FINALS_OPTIONS,
} from "@/lib/forms";
import { buildRegistrationEmail, sendEmailSafely } from "@/lib/email";
import { mirrorRegistrationToSupabase } from "@/lib/portal-registration";
import { rateLimit, requestIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/supabase/admin";
import { findSchoolByName } from "@/lib/school-identity";
import { lookupWaitlistInvite, markInviteConverted } from "@/lib/waitlist-invite";

export const runtime = "nodejs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SCHOOL_SOURCE_OPTIONS = ["existing", "new"] as const;

class ValidationError extends Error {}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function requireString(value: unknown, fieldName: string, maxLength = 200) {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} is required.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${fieldName} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long.`);
  }

  return trimmed;
}

function optionalString(value: unknown, fieldName: string, maxLength = 500) {
  if (value == null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} is invalid.`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${fieldName} is too long.`);
  }

  return trimmed;
}

function requireEmail(value: unknown, fieldName: string) {
  const email = requireString(value, fieldName, 320).toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError(`${fieldName} must be a valid email address.`);
  }

  return email;
}

function optionalEmail(value: unknown, fieldName: string) {
  const email = optionalString(value, fieldName, 320).toLowerCase();
  if (!email) {
    return "";
  }

  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError(`${fieldName} must be a valid email address.`);
  }

  return email;
}

function requirePhone(value: unknown, fieldName: string) {
  const phone = requireString(value, fieldName, 30);
  if (phone.replace(/\D/g, "").length < 7) {
    throw new ValidationError(`${fieldName} must be a valid phone number.`);
  }

  return phone;
}

function requireDate(value: unknown, fieldName: string) {
  const date = requireString(value, fieldName, 10);
  if (!DATE_REGEX.test(date)) {
    throw new ValidationError(`${fieldName} must be a valid date.`);
  }

  return date;
}

function requireOption<T extends readonly string[]>(
  value: unknown,
  options: T,
  fieldName: string,
): T[number] {
  const option = requireString(value, fieldName);
  if (!options.includes(option)) {
    throw new ValidationError(`${fieldName} is invalid.`);
  }

  return option as T[number];
}

function normalizeSchoolName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeRegistrationPayload(payload: unknown): RegistrationFormData {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Invalid registration payload.");
  }

  const data = payload as Record<string, unknown>;

  return {
    studentRep1FullName: requireString(data.studentRep1FullName, "Student Rep 1 Full Name"),
    studentRep1DOB: requireDate(data.studentRep1DOB, "Student Rep 1 DOB"),
    studentRep1Gender: requireOption(data.studentRep1Gender, GENDER_OPTIONS, "Student Rep 1 Gender"),
    studentRep1Class: requireOption(data.studentRep1Class, CLASS_OPTIONS, "Student Rep 1 Class"),
    studentRep1GuardianName: requireString(data.studentRep1GuardianName, "Student Rep 1 Guardian Name"),
    studentRep1GuardianNumber: requirePhone(data.studentRep1GuardianNumber, "Student Rep 1 Guardian Number"),
    studentRep2FullName: requireString(data.studentRep2FullName, "Student Rep 2 Full Name"),
    studentRep2DOB: requireDate(data.studentRep2DOB, "Student Rep 2 DOB"),
    studentRep2Gender: requireOption(data.studentRep2Gender, GENDER_OPTIONS, "Student Rep 2 Gender"),
    studentRep2Class: requireOption(data.studentRep2Class, CLASS_OPTIONS, "Student Rep 2 Class"),
    studentRep2GuardianName: requireString(data.studentRep2GuardianName, "Student Rep 2 Guardian Name"),
    studentRep2GuardianNumber: requirePhone(data.studentRep2GuardianNumber, "Student Rep 2 Guardian Number"),
    studentRep3FullName: requireString(data.studentRep3FullName, "Student Rep 3 Full Name"),
    studentRep3DOB: requireDate(data.studentRep3DOB, "Student Rep 3 DOB"),
    studentRep3Gender: requireOption(data.studentRep3Gender, GENDER_OPTIONS, "Student Rep 3 Gender"),
    studentRep3Class: requireOption(data.studentRep3Class, CLASS_OPTIONS, "Student Rep 3 Class"),
    studentRep3GuardianName: requireString(data.studentRep3GuardianName, "Student Rep 3 Guardian Name"),
    studentRep3GuardianNumber: requirePhone(data.studentRep3GuardianNumber, "Student Rep 3 Guardian Number"),
    schoolLGA: requireOption(data.schoolLGA, LGA_OPTIONS, "School LGA"),
    schoolCategory: requireOption(data.schoolCategory, SCHOOL_CATEGORY_OPTIONS, "School Category"),
    schoolSource: requireOption(data.schoolSource, SCHOOL_SOURCE_OPTIONS, "School Source"),
    schoolFullName: normalizeSchoolName(
      requireString(data.schoolFullName, "School Full Name"),
    ),
    schoolAddress: requireString(data.schoolAddress, "School Address", 300),
    schoolEmail: optionalEmail(data.schoolEmail, "School Email"),
    hearAboutAdewale: requireString(data.hearAboutAdewale, "Hear About Adewale", 300),
    zonalFinalsLocation: requireOption(
      data.zonalFinalsLocation,
      ZONAL_FINALS_OPTIONS,
      "Zonal Finals Location",
    ),
    principalFullName: requireString(data.principalFullName, "Principal Full Name"),
    principalGender: requireOption(data.principalGender, GENDER_OPTIONS, "Principal Gender"),
    principalNumber: requirePhone(data.principalNumber, "Principal Number"),
    principalEmail: requireEmail(data.principalEmail, "Principal Email Address"),
    teacherFullName: requireString(data.teacherFullName, "Teacher Full Name"),
    teacherGender: requireOption(data.teacherGender, GENDER_OPTIONS, "Teacher Gender"),
    teacherNumber: requirePhone(data.teacherNumber, "Teacher Number"),
    teacherEmail: requireEmail(data.teacherEmail, "Teacher Email Address"),
    participatedLastEdition: requireOption(
      data.participatedLastEdition,
      YES_NO_OPTIONS,
      "School Participated In Last Edition",
    ),
    likesAboutLastEdition: optionalString(data.likesAboutLastEdition, "Likes About Last Edition"),
    expectationFromLastEdition: optionalString(
      data.expectationFromLastEdition,
      "Expectation From Last Edition",
    ),
  };
}

export async function POST(request: Request) {
  try {
    // This endpoint sends email and (via onboarding) leads to account creation —
    // cap per-IP throughput. Best-effort in-memory limiter; see lib/rate-limit.
    if (!rateLimit(`reg:${requestIp(request.headers)}`, { limit: 5, windowMs: 60_000 })) {
      return NextResponse.json(
        { error: "Too many attempts — please wait a minute and try again." },
        { status: 429 },
      );
    }

    const payload = await request.json();
    const registration = sanitizeRegistrationPayload(payload);
    // sanitizeRegistrationPayload builds a fresh object, so this extra key never
    // reaches the Airtable mapping or the mirror.
    const inviteToken =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? String((payload as Record<string, unknown>).waitlistToken ?? "").trim()
        : "";

    // The public form is tied to the OPEN edition — the editions table (admin
    // controls it from Portal → Editions) is the single source of truth. No open
    // edition → registration is closed, and the submission is rejected before
    // anything is written. Env fallback only when the portal bridge is off.
    let editionYear = Number(process.env.ASC_EDITION_YEAR) || new Date().getFullYear();
    let invitedWaitlistId: string | null = null;
    const adminDb = createAdminClient();
    if (adminDb) {
      const { data: openEdition } = await adminDb
        .from("editions")
        .select("year")
        .eq("registration_open", true)
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Resolved even when an edition is open, so the waitlist row is still
      // credited with the registration it produced.
      const lookup = inviteToken
        ? await lookupWaitlistInvite(adminDb, inviteToken)
        : ({ ok: false, reason: "missing" } as const);
      if (lookup.ok) invitedWaitlistId = lookup.invite.id;

      if (openEdition) {
        editionYear = openEdition.year as number;
      } else {
        // Closed — a valid invite carries its own target edition and is the only
        // way through. The token is never echoed back.
        if (!lookup.ok || !lookup.invite.invited_edition_year) {
          return NextResponse.json(
            {
              error:
                "Registration is currently closed. New schools can join the waitlist and we'll email them when the next edition opens.",
            },
            { status: 409 },
          );
        }
        editionYear = lookup.invite.invited_edition_year;
      }

      // One registration per school per edition. Matched on the normalized name
      // alone, not name+lga+category: the duplicate rows this replaced disagreed
      // about LGA as often as they agreed, so scoping the lookup by LGA is what let
      // them through. Uses the same normalization as schools_norm_name_key.
      const existingSchool = await findSchoolByName(adminDb, registration.schoolFullName);
      if (existingSchool) {
        const { data: existingReg } = await adminDb
          .from("registrations")
          .select("id")
          .eq("school_id", existingSchool.id)
          .eq("edition_year", editionYear)
          .limit(1)
          .maybeSingle();
        if (existingReg) {
          return NextResponse.json(
            {
              error: `${registration.schoolFullName} is already registered for the ${editionYear} edition. Check your email for the confirmation — or contact the ASC team if you need to correct your entry.`,
              code: "duplicate",
            },
            { status: 409 },
          );
        }
      }

      // One school per educator: an email already approved elsewhere would make
      // the membership write fail after the registration was created.
      const contactEmails = [registration.teacherEmail, registration.principalEmail]
        .map((e) => e.trim().toLowerCase());
      const { data: memberRows, error: memberError } = await adminDb
        .from("school_members")
        .select("email, school_id, schools(name)")
        .eq("status", "approved")
        .in("email", contactEmails);
      if (memberError) {
        return NextResponse.json({ error: "Could not check your details. Please try again." }, { status: 500 });
      }
      const taken = otherSchoolFor(
        ((memberRows ?? []) as unknown as { email: string; school_id: string; schools: { name: string | null } | null }[])
          .map((m) => ({ email: m.email, school_id: m.school_id, school_name: m.schools?.name ?? null })),
        contactEmails,
        existingSchool?.id ?? null,
      );
      if (taken) {
        return NextResponse.json(
          {
            error: `${taken.email} is already linked to ${taken.schoolName}. An educator can belong to one school only — use a different email, or contact the ASC team if you have moved school.`,
            code: "educator_taken",
          },
          { status: 409 },
        );
      }
    }

    const writeToAirtable = isAirtableWritesEnabled();

    let airtableSchoolId: string | null = null;
    if (writeToAirtable && registration.schoolSource === "new") {
      const schoolsTableId = getSchoolDatabaseTableId();
      const existingSchool = await findSchoolByNameCategoryLga(
        schoolsTableId,
        registration.schoolFullName,
        registration.schoolCategory,
        registration.schoolLGA,
      );

      if (existingSchool) {
        airtableSchoolId = existingSchool.id;
      } else {
        const createdSchool = await createAirtableRecord(schoolsTableId, {
          "School Name": registration.schoolFullName,
          "School Category": registration.schoolCategory,
          "School Local Government Area": registration.schoolLGA,
          "School Address": registration.schoolAddress,
          ...(registration.schoolEmail
            ? { "School Email": registration.schoolEmail }
            : {}),
        });
        airtableSchoolId = createdSchool?.records?.[0]?.id ?? null;
      }
    }

    if (writeToAirtable) {
      await createAirtableRecord(
        getParticipantsTableId(),
        mapRegistrationFields(registration),
      );
    } else {
      console.info(
        "Airtable writes disabled (AIRTABLE_WRITES_ENABLED=false) — skipping.",
      );
    }

    // Mirror into Supabase for the portal (non-fatal — Airtable stays source of
    // truth, so a mirror failure must never fail the registration). Runs before
    // the email so the confirmation can carry the coordinator's 30-day
    // activation link (claim code remains the different-email fallback).
    let mirror: Awaited<ReturnType<typeof mirrorRegistrationToSupabase>> = null;
    try {
      mirror = await mirrorRegistrationToSupabase(registration, airtableSchoolId, editionYear);
    } catch (mirrorError) {
      console.error("Supabase mirror failed (non-fatal):", mirrorError);
    }

    // Only on a successful mirror — see markInviteConverted.
    if (adminDb && invitedWaitlistId && mirror?.registrationId) {
      await markInviteConverted(adminDb, invitedWaitlistId, mirror.registrationId);
    }

    // One message per recipient — the teacher's carries the activation link,
    // the principal's does not (they get their own link from the mirror).
    const confirmations = buildRegistrationEmail({
      schoolFullName: registration.schoolFullName,
      schoolLGA: registration.schoolLGA,
      zonalFinalsLocation: registration.zonalFinalsLocation,
      principalFullName: registration.principalFullName,
      principalEmail: registration.principalEmail,
      teacherFullName: registration.teacherFullName,
      teacherEmail: registration.teacherEmail,
      claimCode: mirror?.claimCode ?? null,
      verifyToken: mirror?.verifyToken ?? null,
    });
    for (const confirmation of confirmations) {
      await sendEmailSafely(confirmation);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Invalid JSON payload.");
    }

    if (error instanceof ValidationError) {
      return badRequest(error.message);
    }

    console.error("Registration submission failed:", error);
    return NextResponse.json(
      { error: "Unable to submit registration right now." },
      { status: 500 },
    );
  }
}
