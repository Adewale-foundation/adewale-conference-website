import { NextResponse } from "next/server";
import {
  buildAnnouncementEmail,
  buildCampConfirmationEmail,
  buildCampExtraDecisionEmail,
  buildRegistrationEmail,
  buildSponsorshipEmail,
  sendEmail,
} from "@/lib/email";
import { markdownToEmailHtml } from "@/lib/markdown-email";

export const runtime = "nodejs";

// Dev-only: preview or test-send the confirmation emails.
//   Preview in browser:  /api/email-preview?type=registration
//   Real test send:      /api/email-preview?type=registration&send=you@example.com
// Types: registration (default), sponsorship, announcement, camp, camp-pending,
// camp-approved, camp-declined.
// The test send goes straight through SendGrid, independent of Airtable.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "registration";
  const sendTo = params.get("send");

  // buildRegistrationEmail now returns one message per recipient — preview the
  // teacher's copy (the one that carries the activation link).
  const email =
    campPreview(type) ??
    (type === "announcement"
      ? buildAnnouncementEmail({
          title: "Zonal finals venue has changed",
          bodyHtml: markdownToEmailHtml(
            [
              "The **Sagamu** zonal centre has moved to the Town Hall, off Akarigbo Road.",
              "",
              "What this means for your school:",
              "",
              "- Arrive by 8:30 a.m. — accreditation closes at 9:00",
              "- Bring the two printed consent forms per representative",
              "- Transport reimbursement is unchanged",
              "",
              "## Questions",
              "",
              "Reply to this email or reach us at [hello@adewaleconference.org](mailto:hello@adewaleconference.org).",
            ].join("\n"),
          ),
          announcementPath: "/portal/announcements/preview",
          editionYear: 2026,
          targetRole: "all",
          // Previews the stage-narrowed variant — the row an all-schools send omits.
          audience: "Qualified schools",
          sentAt: new Date(),
          inlineNames: ["revised-directions.pdf"],
          linkOnlyNames: ["centre-map-hi-res.png"],
        })
      : type === "sponsorship"
        ? buildSponsorshipEmail({
            org: "Bluewave Industries Ltd",
            contact: "Adaeze Okafor",
            email: "adaeze@example.com",
            tier: "Gold - ₦5M",
          })
        : buildRegistrationEmail({
            schoolFullName: "Mayflower Secondary School",
            schoolLGA: "Ikenne",
            zonalFinalsLocation: "Sagamu",
            principalFullName: "Mrs. Folake Adeyemi",
            principalEmail: "principal@example.com",
            teacherFullName: "Mr. Tunde Bello",
            teacherEmail: "teacher@example.com",
          })[0]);

  if (sendTo) {
    try {
      const accepted = await sendEmail({
        to: [{ email: sendTo }],
        subject: email.subject,
        html: email.html,
      });
      return NextResponse.json({ sentTo: sendTo, accepted });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Send failed." },
        { status: 500 },
      );
    }
  }

  return new NextResponse(email.html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Fictional school and people, as everywhere in this repo.
function campPreview(type: string) {
  const school = {
    email: "teacher@example.com",
    schoolFullName: "Riverbend Academy",
    campTitle: "ASC Camp 2026",
    primary: { name: "Mrs Ada Nwosu", phone: "0803 123 4567" },
    contestants: ["Chidi Okonkwo", "Funke Bello", "Halima Sule"],
    venue: "NYSC Permanent Orientation Camp, Sagamu",
    arrival: "Mon, 26 Oct 2026, 2:00 pm",
    departure: "Wed, 28 Oct 2026, 3:00 pm",
  };
  if (type === "camp" || type === "camp-pending") {
    return buildCampConfirmationEmail({
      ...school,
      attending: true,
      deadline: "Wed, 7 Oct 2026, 11:59 pm",
      extra: type === "camp-pending" ? { name: "Ms Zainab Quill", status: "pending" } : null,
      whatsappUrl: "https://chat.whatsapp.com/example",
    });
  }
  if (type === "camp-approved" || type === "camp-declined") {
    return buildCampExtraDecisionEmail({
      ...school,
      approved: type === "camp-approved",
      extraName: "Ms Zainab Quill",
      adminNote: type === "camp-declined" ? "We can only accommodate one educator per school this year." : null,
    });
  }
  return null;
}
