import { NextResponse } from "next/server";
import {
  buildAnnouncementEmail,
  buildCampConfirmationEmail,
  buildCampExtraDecisionEmail,
  buildFinaleTicketEmail,
  buildRegistrationEmail,
  FINALE_TICKET_QR_CID,
  type EmailAttachment,
  buildSponsorshipEmail,
  sendEmail,
} from "@/lib/email";
import { markdownToEmailHtml } from "@/lib/markdown-email";
import { GRAND_FINALE } from "@/lib/finale-attend";
import QRCode from "qrcode";

export const runtime = "nodejs";

// Dev-only: preview or test-send the confirmation emails.
//   Preview in browser:  /api/email-preview?type=registration
//   Real test send:      /api/email-preview?type=registration&send=you@example.com
// Types: registration (default), sponsorship, announcement, camp, camp-pending,
// camp-approved, camp-declined, finale, finale-waitlist.
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
    (await finalePreview(type)) ??
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

  const attachments = "attachments" in email ? (email.attachments as EmailAttachment[]) : [];

  if (sendTo) {
    try {
      const accepted = await sendEmail({
        to: [{ email: sendTo }],
        subject: email.subject,
        html: email.html,
        attachments,
      });
      return NextResponse.json({ sentTo: sendTo, accepted });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Send failed." },
        { status: 500 },
      );
    }
  }

  // A browser can't resolve cid: images, so the preview inlines the QR instead.
  const inline = attachments.find((a) => a.contentId === FINALE_TICKET_QR_CID);
  const html = inline ? email.html.replace(`cid:${FINALE_TICKET_QR_CID}`, `data:image/png;base64,${inline.content}`) : email.html;
  return new NextResponse(html, {
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

async function finalePreview(type: string) {
  if (type !== "finale" && type !== "finale-waitlist") return null;
  const png = await QRCode.toBuffer("https://www.adewaleconference.org/grand-finale/ticket/GF-7K3QPM", { width: 260, margin: 1 });
  return buildFinaleTicketEmail({
    email: "teacher@example.com",
    firstName: "Ada",
    lastName: "Nwosu",
    refCode: "GF-7K3QPM",
    seats: 4,
    studentCount: 3,
    educators: [],
    namedStudents: ["Chidi Okonkwo (SS 2)", "Funke Bello"],
    status: type === "finale" ? "confirmed" : "waitlisted",
    source: "open",
    organisation: "Riverbend Academy",
    event: GRAND_FINALE,
    ticketUrl: "https://www.adewaleconference.org/grand-finale/ticket/GF-7K3QPM",
    qrPngBase64: png.toString("base64"),
  });
}
