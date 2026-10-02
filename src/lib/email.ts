import { readFileSync } from "node:fs";
import { join } from "node:path";
import sendgrid, { type MailDataRequired } from "@sendgrid/mail";
import { SITE_URL } from "./site";
import { FELLOWS_EVENT_DATE, FELLOWS_EVENT_HOURS } from "./fellows-programme";
import {
  ANNOUNCEMENT_TARGET_EMAIL_LABEL,
  type AnnouncementTargetRole,
} from "./announcements";

const DEFAULT_FROM_NAME = "Adewale Students Conference";
const EMAILS_DIR = join(process.cwd(), "src", "emails");

interface EmailRecipient {
  email: string;
  name?: string;
}

/** A file carried by the message itself. SendGrid requires base64, not a Buffer. */
export interface EmailAttachment {
  filename: string;
  content: string;
  type?: string;
}

interface SendEmailInput {
  to: EmailRecipient[];
  subject: string;
  html: string;
  bcc?: EmailRecipient[];
  attachments?: EmailAttachment[];
}

/**
 * Domains that can never receive mail. RFC 2606 reserves example.com/net/org
 * and the .test / .example / .invalid / .localhost TLDs for documentation and
 * testing; RFC 6761 makes .local mDNS-only (which is where the synthetic
 * student addresses live).
 *
 * Sending to one of these is a guaranteed hard bounce, and bounce rate is
 * scored against the sending domain's reputation — so a dev database seeded
 * with example.com educators could quietly damage deliverability for real
 * mail. Dropping them is correct in every environment, not a dev-only hack.
 */
const UNDELIVERABLE_DOMAINS = ["example.com", "example.net", "example.org"];
const UNDELIVERABLE_TLDS = [".test", ".example", ".invalid", ".localhost", ".local"];

export function isUndeliverableAddress(email: string | null | undefined): boolean {
  const at = (email ?? "").trim().toLowerCase();
  const domain = at.slice(at.lastIndexOf("@") + 1);
  if (!domain || !at.includes("@")) return true; // nothing to deliver to
  if (UNDELIVERABLE_DOMAINS.includes(domain)) return true;
  return UNDELIVERABLE_TLDS.some((tld) => domain.endsWith(tld));
}

/** Split recipients into the ones worth sending to and the ones that can't receive. */
function partitionDeliverable(recipients: EmailRecipient[]) {
  const deliverable: EmailRecipient[] = [];
  let skipped = 0;
  for (const recipient of recipients) {
    if (isUndeliverableAddress(recipient?.email)) skipped++;
    else deliverable.push(recipient);
  }
  return { deliverable, skipped };
}

function getApiKey() {
  return process.env.SENDGRID_API_KEY ?? "";
}

function emailSendsEnabled() {
  const value = process.env.ADEWALE_EMAILS_ENABLED;
  if (!value) return true;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function getSenderAddress() {
  const value = process.env.ADEWALE_EMAIL_FROM;
  if (!value) {
    throw new Error("ADEWALE_EMAIL_FROM is not configured.");
  }
  return value;
}

function getSenderName() {
  return process.env.ADEWALE_EMAIL_FROM_NAME ?? DEFAULT_FROM_NAME;
}

function getReplyTo(): EmailRecipient | null {
  const email = process.env.ADEWALE_REPLY_TO;
  if (!email) return null;
  return { email, name: getSenderName() };
}

function getNotifyRecipient(): EmailRecipient | null {
  const email = process.env.ADEWALE_NOTIFY_EMAIL;
  if (!email) return null;
  return { email };
}

/** The team inbox, as a list — empty when ADEWALE_NOTIFY_EMAIL is unset, so a
 *  caller can skip the send rather than mail nobody. Public forms with no admin
 *  module behind them (sponsorship, Fellows) notify here. */
export function getNotifyRecipients(): EmailRecipient[] {
  const recipient = getNotifyRecipient();
  return recipient ? [recipient] : [];
}

/**
 * Sends an email via SendGrid using inline HTML content.
 *
 * Returns false (and logs) instead of throwing when the API key is absent so
 * local development and form submissions never fail just because email is not
 * configured. Real SendGrid errors are surfaced to the caller.
 */
export async function sendEmail({
  to,
  subject,
  html,
  bcc,
  attachments,
}: SendEmailInput): Promise<boolean> {
  if (!emailSendsEnabled()) {
    console.warn("ADEWALE_EMAILS_ENABLED disables email sending; skipping email send.");
    return false;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("SENDGRID_API_KEY is not configured; skipping email send.");
    return false;
  }

  // Reserved/undeliverable addresses (seeded dev data) never reach SendGrid, so
  // they cannot bounce against the sending domain.
  const { deliverable, skipped } = partitionDeliverable(to);
  if (skipped) {
    console.warn(`Skipping ${skipped} undeliverable recipient(s) (reserved domain).`);
  }
  if (deliverable.length === 0) {
    return false;
  }
  const deliverableBcc = bcc ? partitionDeliverable(bcc).deliverable : undefined;

  sendgrid.setApiKey(apiKey);

  // Spam filters score HTML-only mail worse — always include a text/plain
  // alternative derived from the HTML.
  const text = htmlToText(html);

  const replyTo = getReplyTo();
  const mail: MailDataRequired = {
    from: { email: getSenderAddress(), name: getSenderName() },
    ...(replyTo ? { replyTo } : {}),
    personalizations: [
      {
        to: deliverable,
        ...(deliverableBcc?.length ? { bcc: deliverableBcc } : {}),
      },
    ],
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
    // SendGrid carries attachments on the message, not per personalization.
    ...(attachments?.length ? { attachments } : {}),
  };

  const [response] = await sendgrid.send(mail);
  return response.statusCode === 202;
}

/** How many recipients SendGrid accepts in one request's personalizations. */
const BULK_BATCH_SIZE = 500;

/**
 * One message, many recipients — for broadcasts whose body carries nothing
 * recipient-specific.
 *
 * Each recipient gets their OWN `to` personalization (never bcc, which would
 * leak the whole educator list to everyone), batched so a thousand educators is
 * two API calls rather than a thousand serial ones — the difference between a
 * couple of seconds and blowing past the serverless function limit mid-send.
 * Attachments ride once per request, not once per recipient.
 *
 * Never throws: a failing batch is counted, and the rest still go out, so a
 * partial outage is reportable instead of silent.
 *
 * `skipped` counts recipients dropped as undeliverable (reserved domains — the
 * seeded dev educators). They are reported rather than hidden, so a test send
 * that reaches nobody does not look like a silent success.
 */
export async function sendBulkEmail(input: {
  recipients: EmailRecipient[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const addressed = input.recipients.filter((r) => r.email?.trim());
  const { deliverable: recipients, skipped } = partitionDeliverable(addressed);
  if (skipped) {
    console.warn(`Skipping ${skipped} undeliverable recipient(s) (reserved domain).`);
  }
  if (recipients.length === 0) return { sent: 0, failed: 0, skipped };

  if (!emailSendsEnabled()) {
    console.warn("ADEWALE_EMAILS_ENABLED disables email sending; skipping bulk send.");
    return { sent: 0, failed: 0, skipped };
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("SENDGRID_API_KEY is not configured; skipping bulk send.");
    return { sent: 0, failed: 0, skipped };
  }
  sendgrid.setApiKey(apiKey);

  const text = htmlToText(input.html);
  const replyTo = getReplyTo();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BULK_BATCH_SIZE) {
    const batch = recipients.slice(i, i + BULK_BATCH_SIZE);
    const mail: MailDataRequired = {
      from: { email: getSenderAddress(), name: getSenderName() },
      ...(replyTo ? { replyTo } : {}),
      personalizations: batch.map((recipient) => ({ to: [recipient] })),
      subject: input.subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: input.html },
      ],
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };

    try {
      const [response] = await sendgrid.send(mail);
      if (response.statusCode === 202) sent += batch.length;
      else failed += batch.length;
    } catch (error) {
      // Log the message and status only. A SendGrid ResponseError carries the
      // response body, which echoes the personalizations — logging the whole
      // object would put up to BULK_BATCH_SIZE educator addresses into the
      // platform logs on every failed batch.
      const status = (error as { code?: number })?.code;
      console.error(
        `Bulk email batch failed (${batch.length} recipients${status ? `, status ${status}` : ""}): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      failed += batch.length;
    }
  }

  return { sent, failed, skipped };
}

/**
 * Sends an email and never throws — failures are logged so a downstream
 * submission (Airtable write) is not rolled back by a mail outage.
 */
export async function sendEmailSafely(input: SendEmailInput): Promise<void> {
  try {
    await sendEmail(input);
  } catch (error) {
    console.error("Email send failed:", error);
  }
}

// Rough plain-text rendering of an email body: links become "label (url)",
// block boundaries become newlines, entities are decoded.
function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const cleanLabel = label.replace(/<[^>]+>/g, "").trim();
      return cleanLabel ? `${cleanLabel} (${href})` : href;
    })
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const templateCache = new Map<string, string>();

function loadTemplate(name: string) {
  const cached = templateCache.get(name);
  if (cached) return cached;

  const template = readFileSync(join(EMAILS_DIR, `${name}.html`), "utf8");
  templateCache.set(name, template);
  return template;
}

/**
 * Fills `{{key}}` placeholders with HTML-escaped values, and `{{{key}}}`
 * placeholders with raw (already-trusted HTML) values.
 */
function interpolate(template: string, data: Record<string, string>) {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (match, rawKey, escKey) => {
    if (rawKey) {
      return rawKey in data ? data[rawKey] : match;
    }
    return escKey in data ? escapeHtml(data[escKey]) : match;
  });
}

/** Renders a body template, then wraps it in the shared layout. */
function render(bodyTemplate: string, heading: string, data: Record<string, string>) {
  const body = interpolate(loadTemplate(bodyTemplate), data);
  return interpolate(loadTemplate("layout"), { heading, body });
}

export interface RegistrationEmailData {
  schoolFullName: string;
  schoolLGA: string;
  zonalFinalsLocation: string;
  principalFullName: string;
  principalEmail: string;
  teacherFullName: string;
  teacherEmail: string;
  claimCode?: string | null;
  verifyToken?: string | null;
}

// Pre-rendered HTML inviting the coordinator to activate their portal account
// (self-service onboarding — the link is valid for 30 days and replaces the old
// claim-code flow; the claim code remains as a small different-email fallback).
// Empty when the Supabase mirror is off, so the email simply omits the section.
function buildActivateBlock(verifyToken?: string | null, claimCode?: string | null) {
  if (!verifyToken) return buildClaimBlock(claimCode);
  const activateUrl = `${SITE_URL}/portal/onboard?token=${encodeURIComponent(verifyToken)}`;
  const claimFootnote = claimCode
    ? `<p class="body-font" style="margin:14px 0 0;font-size:12px;line-height:18px;color:#8a8672;">Prefer a different email than this one? Sign up in the portal and use claim code <span style="font-family:monospace;font-weight:bold;color:#4A4E5C;">${escapeHtml(claimCode)}</span> at ${SITE_URL}/portal/claim.</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:26px 0 0;background:#FBF3E2;border:1px solid #E8A020;">
  <tr><td style="padding:18px;">
    <p class="body-font" style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a5e0e;">Activate your school portal</p>
    <p class="body-font" style="margin:0 0 14px;font-size:15px;line-height:24px;color:#4A4E5C;">Set your password to activate your coordinator account — your students' login codes will be ready inside, along with practice drills, learning plans, and your registration status. This link is valid for 30 days.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#E8A020;">
      <a href="${activateUrl}" style="display:inline-block;padding:11px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0A0F1E;text-decoration:none;">Activate your portal account →</a>
    </td></tr></table>
    ${claimFootnote}
  </td></tr>
</table>`;
}

// Legacy claim-code block — used only when the mirror produced a claim code but
// no verify token (e.g. rows created before self-service onboarding).
function buildClaimBlock(claimCode?: string | null) {
  if (!claimCode) return "";
  const claimUrl = `${SITE_URL}/portal/claim?code=${encodeURIComponent(claimCode)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:26px 0 0;background:#FBF3E2;border:1px solid #E8A020;">
  <tr><td style="padding:18px;">
    <p class="body-font" style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a5e0e;">Manage your school online</p>
    <p class="body-font" style="margin:0 0 14px;font-size:15px;line-height:24px;color:#4A4E5C;">Sign in to claim your school — track your status, manage representatives, and download certificates. Your claim code:</p>
    <p style="margin:0 0 16px;font-size:22px;font-weight:bold;letter-spacing:3px;font-family:monospace;color:#0A0F1E;">${escapeHtml(claimCode)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#E8A020;">
      <a href="${claimUrl}" style="display:inline-block;padding:11px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0A0F1E;text-decoration:none;">Claim your school →</a>
    </td></tr></table>
  </td></tr>
</table>`;
}

// Returns one message PER recipient — never a single email addressed to both —
// because the activation link is the coordinating teacher's private onboarding
// secret. Bundling both into one `to` would hand the principal (and anyone
// they forward to) the teacher's account. The teacher's copy carries the
// activation block; the principal's is a plain confirmation (they receive their
// OWN activation link in a separate email from the registration mirror). When
// they share an inbox, only the teacher's copy — with the link — is sent.
export function buildRegistrationEmail(data: RegistrationEmailData): SendEmailInput[] {
  const subject = `Registration received — ${data.schoolFullName}`;
  const notify = getNotifyRecipient();
  const bcc = notify ? [notify] : undefined;

  const renderFor = (claimBlock: string) =>
    render("registration", "Registration received", {
      schoolFullName: data.schoolFullName,
      schoolLGA: data.schoolLGA,
      zonalFinalsLocation: data.zonalFinalsLocation,
      principalFullName: data.principalFullName,
      teacherFullName: data.teacherFullName,
      claimBlock,
    });

  const teacherLower = data.teacherEmail.trim().toLowerCase();
  const principalLower = data.principalEmail.trim().toLowerCase();

  // Teacher (coordinator): confirmation WITH the activation link.
  const messages: SendEmailInput[] = [
    {
      to: [{ email: data.teacherEmail, name: data.teacherFullName }],
      subject,
      html: renderFor(buildActivateBlock(data.verifyToken, data.claimCode)),
      ...(bcc ? { bcc } : {}),
    },
  ];

  // Principal: same confirmation but NO activation link. Skipped when they share
  // the teacher's inbox (the message above already reached them, with the link).
  if (principalLower && principalLower !== teacherLower) {
    messages.push({
      to: [{ email: data.principalEmail, name: data.principalFullName }],
      subject,
      html: renderFor(""),
    });
  }

  return messages;
}

/** Heads-up to the conference team when a new registration lands (awareness only). */
export function buildAdminNewRegistrationEmail(data: {
  recipients: EmailRecipient[];
  schoolFullName: string;
  schoolLGA: string;
  teacherFullName: string;
  contactEmail: string;
  editionYear: number;
  reps: string;
}) {
  const subject = `New registration — ${data.schoolFullName} (${data.editionYear})`;
  const html = render("admin-new-registration", "New registration", {
    schoolFullName: data.schoolFullName,
    schoolLGA: data.schoolLGA,
    teacherFullName: data.teacherFullName,
    contactEmail: data.contactEmail,
    editionYear: String(data.editionYear),
    reps: data.reps || "—",
    reviewUrl: `${SITE_URL}/portal/admin/registrations`,
  });
  return { to: data.recipients, subject, html };
}

/** Standalone activation (re)send — same 30-day link block as the confirmation. */
export function buildActivationEmail(data: {
  email: string;
  name?: string | null;
  schoolFullName: string;
  verifyToken: string;
  claimCode?: string | null;
}) {
  const subject = `Activate your ASC portal account — ${data.schoolFullName}`;
  const html = render("activation", "Activate your account", {
    schoolFullName: data.schoolFullName,
    activateBlock: buildActivateBlock(data.verifyToken, data.claimCode),
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

export function buildMagicAccessEmail(data: {
  email: string;
  name?: string | null;
  schoolFullName: string;
  actionLink: string;
  code?: string | null;
}) {
  const subject = `Your ASC portal access link — ${data.schoolFullName}`;
  const codeBlock = data.code
    ? `<p class="body-font" style="margin:14px 0 0;font-size:13px;line-height:20px;color:#4A4E5C;">If the button does not work, return to the portal and enter this one-time code: <span style="font-family:monospace;font-weight:bold;color:#0A0F1E;">${escapeHtml(data.code)}</span></p>`
    : "";
  const html = render("activation", "Access your portal", {
    schoolFullName: data.schoolFullName,
    activateBlock: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:26px 0 0;background:#FBF3E2;border:1px solid #E8A020;">
  <tr><td style="padding:18px;">
    <p class="body-font" style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a5e0e;">Portal access link</p>
    <p class="body-font" style="margin:0 0 14px;font-size:15px;line-height:24px;color:#4A4E5C;">Use this secure email link to enter the portal. If this is your first time, you will set a password after signing in.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#E8A020;">
      <a href="${data.actionLink}" style="display:inline-block;padding:11px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#0A0F1E;text-decoration:none;">Open the portal →</a>
    </td></tr></table>
    ${codeBlock}
  </td></tr>
</table>`,
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

// The portal sign-in page, pre-set to land on the school dashboard. First-time
// educators sign in with a one-time email link and then set a password — there
// is no public sign-up (accounts come from registration + the Airtable sync).
function getPortalLoginUrl(next = "/portal/school") {
  return `${SITE_URL}/portal/login?redirectTo=${encodeURIComponent(next)}`;
}

/** Official acceptance — directs educators to log in and download the guide. */
export function buildAcceptedEmail(data: {
  email: string;
  name?: string | null;
  schoolFullName: string;
  editionYear: number;
}) {
  const subject = `You're in — ${data.schoolFullName} is confirmed for ASC ${data.editionYear}`;
  const html = render("accepted", "Entry confirmed", {
    schoolFullName: data.schoolFullName,
    editionYear: String(data.editionYear),
    portalUrl: getPortalLoginUrl(),
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** Polite not-selected email (portal/prep access stays open). */
export function buildDeclinedEmail(data: {
  email: string;
  name?: string | null;
  schoolFullName: string;
  editionYear: number;
  declineReason?: string | null;
}) {
  const subject = `Your ASC ${data.editionYear} entry — ${data.schoolFullName}`;
  // The letter adapts to whether the admin left a reason. With a reason the entry
  // is fixable, so the copy is softer and points to the resubmit path; without
  // one it's the original polite not-selected note. All three blocks are raw HTML
  // so an empty one leaves no stray placeholder; any reason text is escaped.
  const reason = (data.declineReason ?? "").trim();
  const pStyle = "margin:0 0 18px;font-size:15px;line-height:24px;color:#4A4E5C;";
  const verdictBlock = reason
    ? `<p class="body-font" style="${pStyle}">After reviewing your entry for the ${data.editionYear} competition, we couldn&rsquo;t accept it as it currently stands. The reason is below &mdash; the good news is you can fix it and resubmit for another review.</p>`
    : `<p class="body-font" style="${pStyle}">After reviewing all applications for this edition, we&rsquo;re sorry to share that your school&rsquo;s entry was not selected this time. Interest this year was exceptional, and the decision does not reflect on your students&rsquo; potential.</p>`;
  const reasonBlock = reason
    ? `<p class="body-font" style="${pStyle}"><strong style="color:#0A0F1E;">Reason:</strong> ${escapeHtml(reason)}</p>`
    : "";
  const closingBlock = reason
    ? `<p class="body-font" style="${pStyle}">Log in to your portal, make the change (for example, replace a representative), and resubmit your entry for review. Your portal access &mdash; practice drills, the Tech Skills Lab, plans and resources &mdash; stays open throughout.</p>`
    : `<p class="body-font" style="${pStyle}">Your portal access remains open &mdash; your students can keep using the practice drills, Tech Skills Lab, and study resources all year, and we&rsquo;d be glad to see ${escapeHtml(data.schoolFullName)} register again next edition.</p>`;
  const html = render("declined", "Entry update", {
    schoolFullName: data.schoolFullName,
    editionYear: String(data.editionYear),
    portalUrl: getPortalLoginUrl(),
    verdictBlock,
    reasonBlock,
    closingBlock,
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** Receipt for a school's ASC Camp response — attending or not. */
export function buildCampConfirmationEmail(data: {
  email: string;
  name?: string | null;
  schoolFullName: string;
  campTitle: string;
  attending: boolean;
  venue?: string | null;
  arrival?: string | null;
  departure?: string | null;
  deadline?: string | null;
  educators?: { name: string; phone: string | null }[];
  whatsappUrl?: string | null;
}) {
  const pStyle = "margin:0 0 18px;font-size:15px;line-height:24px;color:#4A4E5C;";
  const row = (label: string, value?: string | null) =>
    value
      ? `<p class="body-font" style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4A4E5C;"><strong style="color:#0A0F1E;">${label}:</strong> ${escapeHtml(value)}</p>`
      : "";
  const detailsBlock = data.attending
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#FBF3E2;border:1px solid #E8A020;"><tr><td style="padding:18px;">
<p class="body-font" style="margin:0 0 10px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a5e0e;">Your place is secured</p>
${row("Venue", data.venue)}${row("Arrival", data.arrival)}${row("Departure", data.departure)}${row(
  (data.educators ?? []).length > 1 ? "Accompanying educators" : "Accompanying educator",
  (data.educators ?? []).map((e) => [e.name, e.phone].filter(Boolean).join(" · ")).join("; "),
)}
</td></tr></table>`
    : `<p class="body-font" style="${pStyle}">Thank you for letting us know. Your school's place may now be offered to another school, so please reply to this email straight away if your plans change.</p>`;
  const nextBlock = data.attending
    ? [
        data.whatsappUrl
          ? `<p class="body-font" style="margin:22px 0 18px;font-size:15px;line-height:24px;color:#4A4E5C;"><strong style="color:#0A0F1E;">Join the camp WhatsApp group</strong> for updates from the Planning Committee: <a href="${escapeHtml(data.whatsappUrl)}" style="color:#8a5e0e;">${escapeHtml(data.whatsappUrl)}</a></p>`
          : "",
        `<p class="body-font" style="${pStyle}">Please arrive on time &mdash; accreditation and room allocation begin on arrival. Each student needs their school uniform, nightwear, toiletries, bedding, a bucket, a water bottle, a torch and any labelled medication. Students may not use phones during competition rounds. The full camp program is in your portal.</p>`,
      ].join("")
    : "";
  const html = render("camp-confirmation", data.attending ? "Camp place confirmed" : "Camp response received", {
    intro: data.attending
      ? `${data.schoolFullName} is confirmed for ${data.campTitle}. We look forward to welcoming your team.`
      : `We've recorded that ${data.schoolFullName} cannot attend ${data.campTitle}.`,
    detailsBlock,
    nextBlock,
    deadline: data.deadline || "the confirmation deadline",
    portalUrl: getPortalLoginUrl("/portal/school/camp"),
  });
  const subject = data.attending
    ? `Camp place confirmed — ${data.schoolFullName}`
    : `Camp response received — ${data.schoolFullName}`;
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/**
 * A free-form announcement from the admin console.
 *
 * `bodyHtml` is produced by markdownToEmailHtml — the ONE place admin-authored
 * text becomes raw HTML — and is interpolated with {{{ }}} accordingly. The CTA
 * routes through the login redirect so an unauthenticated click lands on login
 * and comes back to the announcement.
 */
export function buildAnnouncementEmail(data: {
  title: string;
  bodyHtml: string;
  announcementPath: string;
  editionYear: number | null;
  targetRole: AnnouncementTargetRole;
  /** Stage audience, already rendered; null when it went to every school. */
  audience: string | null;
  sentAt: Date;
  inlineNames: string[];
  linkOnlyNames: string[];
}) {
  const files = [...data.inlineNames, ...data.linkOnlyNames];
  const fileItems = files
    .map(
      (name) =>
        `<li style="margin:0 0 4px;">${escapeHtml(name)}${
          data.linkOnlyNames.includes(name)
            ? ' <span style="color:#8a8672;">(in the portal)</span>'
            : ""
        }</li>`,
    )
    .join("");
  const attachmentBlock = files.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid rgba(10,15,30,0.12);margin:22px 0 0;">
  <tr><td style="padding:18px 0 0;">
    <p class="body-font" style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#8a5e0e;">${
      files.length === 1 ? "Attachment" : "Attachments"
    }</p>
    <ul class="body-font" style="margin:0;padding-left:20px;font-size:14px;line-height:22px;color:#4A4E5C;">${fileItems}</ul>
    ${
      data.linkOnlyNames.length
        ? '<p class="body-font" style="margin:10px 0 0;font-size:12px;line-height:18px;color:#8a8672;">Larger files are not attached to this email &mdash; open the announcement in your portal to download them.</p>'
        : ""
    }
  </td></tr>
</table>`
    : "";

  // "At a glance": the announcement's own facts, above the message body, so the
  // email says what this is and who it went to without opening the portal.
  // Rows are label/value pairs in a table — the only layout email clients render
  // consistently. A row is omitted rather than shown empty.
  const rows: [string, string][] = [
    [
      "Sent",
      data.sentAt.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ],
    ["Edition", data.editionYear ? String(data.editionYear) : "All editions"],
    ["For", ANNOUNCEMENT_TARGET_EMAIL_LABEL[data.targetRole]],
  ];
  if (data.audience) {
    rows.push(["Schools", data.audience]);
  }
  if (files.length) {
    rows.push(["Files", `${files.length} attached`]);
  }

  // Each row on ONE line: htmlToText breaks on </tr> but not </td>, so a row
  // split across source lines would put the label and its value on separate
  // lines of the plain-text alternative.
  const detailRows = rows
    .map(
      ([label, value]) =>
        `<tr><td class="body-font" style="padding:3px 14px 3px 0;font-size:11px;font-weight:bold;letter-spacing:0.1em;text-transform:uppercase;color:#8a8672;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td class="body-font" style="padding:3px 0;font-size:14px;line-height:20px;color:#0A0F1E;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const detailsCard = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#FAF7F0;border-left:3px solid #E8A020;margin:0 0 24px;">
  <tr><td style="padding:16px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${detailRows}</table>
  </td></tr>
</table>`;

  const html = render("announcement", data.title, {
    title: data.title,
    detailsCard,
    bodyHtml: data.bodyHtml,
    announcementUrl: getPortalLoginUrl(data.announcementPath),
    attachmentBlock,
  });

  return { subject: data.title, html };
}

/** Manual registration open/closed announcement to school educators. */
export function buildRegistrationStatusEmail(data: {
  email: string;
  name?: string | null;
  editionYear: number;
  registrationOpen: boolean;
}) {
  const statusLabel = data.registrationOpen ? "open" : "closed";
  const subject = data.registrationOpen
    ? `ASC ${data.editionYear} registration is open`
    : `ASC ${data.editionYear} registration is closed`;
  const html = render("registration-status", `Registration ${statusLabel}`, {
    editionYear: String(data.editionYear),
    statusLabel,
    eyebrow: data.registrationOpen ? "Registration open" : "Registration closed",
    message: data.registrationOpen
      ? "Schools can submit or update their conference registration through the portal while the window remains open."
      : "New school registrations are no longer being accepted. Your portal remains available for preparation, updates, and competition information.",
    portalUrl: getPortalLoginUrl(),
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** Admin team invitation — the emailed single-use token link lands on a
 * set-password page; the account is created pre-verified (clicking the link
 * proves address ownership). */
export function buildTeamInviteEmail(data: {
  email: string;
  invitedBy: string;
  verifyToken: string;
}) {
  const subject = "You're invited to the ASC portal team";
  const html = render("team-invite", "Team invitation", {
    invitedBy: data.invitedBy,
    email: data.email,
    inviteUrl: `${SITE_URL}/portal/team-invite?token=${encodeURIComponent(data.verifyToken)}`,
  });
  console.log("Email sent")
  return { to: [{ email: data.email }], subject, html };
}

/** Waitlist confirmation — sent when a school joins while registration is closed. */
export function buildWaitlistEmail(data: {
  email: string;
  name?: string | null;
  schoolName: string;
}) {
  const subject = `You're on the waitlist — ${data.schoolName}`;
  const html = render("waitlist", "You're on the list", {
    schoolName: data.schoolName,
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** Registration-open announcement to a waitlisted school (admin-triggered). */
export function buildWaitlistOpenEmail(data: {
  email: string;
  name?: string | null;
  schoolName: string;
  editionYear: number;
}) {
  const subject = `Registration is open — ASC ${data.editionYear}`;
  const html = render("waitlist-open", "Registration is open", {
    schoolName: data.schoolName,
    editionYear: String(data.editionYear),
    registerUrl: `${SITE_URL}/#register`,
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** Single-school invite to register while registration is closed. */
export function buildWaitlistInviteEmail(data: {
  email: string;
  name?: string | null;
  schoolName: string;
  editionYear: number;
  inviteToken: string;
  expiresAt: string;
}) {
  const subject = `Your invitation to register — ASC ${data.editionYear}`;
  const html = render("waitlist-invite", "You're invited to register", {
    schoolName: data.schoolName,
    editionYear: String(data.editionYear),
    inviteUrl: waitlistInviteUrl(data.inviteToken),
    expiresLabel: new Date(data.expiresAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });
  const to: EmailRecipient[] = [{ email: data.email, ...(data.name ? { name: data.name } : {}) }];
  return { to, subject, html };
}

/** The one place the invite link is spelled; the admin page shows the same URL. */
export function waitlistInviteUrl(token: string) {
  return `${SITE_URL}/register?invite=${encodeURIComponent(token)}`;
}

export interface SponsorshipEmailData {
  org: string;
  contact: string;
  email: string;
  tier: string;
}

export function buildSponsorshipEmail(data: SponsorshipEmailData) {
  const subject = `We received your sponsorship enquiry — ${data.org}`;
  const html = render("sponsorship", "Enquiry received", {
    contact: data.contact,
    org: data.org,
    tier: data.tier,
  });

  const to: EmailRecipient[] = [{ email: data.email, name: data.contact }];
  const notify = getNotifyRecipient();
  return { to, bcc: notify ? [notify] : undefined, subject, html };
}

export interface FellowEmailData {
  fullName: string;
  email: string;
  phone: string;
  stateCode: string;
  batch: string;
  ppa: string;
  ppaLga: string;
  preferredCentre: string;
  roles: string;
  scenarioScore: string;
  eventDate: string;
}

/** Confirmation to the applicant. Deliberately says nothing about their scenario
 *  score — the answers are a selection signal, not feedback. */
export function buildFellowApplicationEmail(data: FellowEmailData) {
  const subject = "We received your Fellows application";
  const html = render("fellow-application", "Application received", {
    firstName: data.fullName.split(/\s+/)[0] || data.fullName,
    eventDate: data.eventDate,
    preferredCentre: data.preferredCentre,
    stateCode: data.stateCode,
  });

  return { to: [{ email: data.email, name: data.fullName }], subject, html };
}

/**
 * Team notification. When `sheetFailed` is set the applicant's details are still
 * delivered here with the failure called out, so a Google outage costs us a retry
 * rather than the application itself.
 */
export function buildAdminNewFellowEmail(
  data: FellowEmailData & { recipients: EmailRecipient[]; sheetFailed?: string },
) {
  const subject = data.sheetFailed
    ? `SHEET WRITE FAILED — Fellows application from ${data.fullName}`
    : `New Fellows application — ${data.fullName}`;

  const failureNotice = data.sheetFailed
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 26px;background:#FDECEC;border:1px solid #B91C1C;"><tr><td style="padding:18px;">
    <p class="body-font" style="margin:0 0 8px;font-size:11px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#B91C1C;">Not written to the sheet</p>
    <p class="body-font" style="margin:0;font-size:14px;line-height:21px;color:#4A4E5C;">This application did not reach the spreadsheet, so the details below are the only copy. Add the row by hand, then check the Apps Script deployment. Error: ${escapeHtml(data.sheetFailed)}</p>
  </td></tr></table>`
    : "";

  const html = render("admin-new-fellow", data.sheetFailed ? "Application not saved" : "New application", {
    alertLine: data.sheetFailed
      ? "A Fellows application came in but could not be written to the sheet."
      : "A new graduate has applied to join the Fellows programme.",
    failureNotice,
    fullName: data.fullName,
    phone: data.phone,
    email: data.email,
    stateCode: data.stateCode,
    batch: data.batch || "—",
    ppa: data.ppa,
    ppaLga: data.ppaLga,
    preferredCentre: data.preferredCentre,
    roles: data.roles || "—",
    scenarioScore: data.scenarioScore,
  });

  return { to: data.recipients, subject, html };
}

/**
 * Their centre, their link, and the address they must type to get in.
 *
 * Centre staff hold no account, so this email IS their credential handover —
 * which is why it repeats the address back rather than just saying "sign in":
 * a lead who types a different one of their addresses is refused, and on exam
 * morning nobody has time to work out why.
 */
export function buildCentreStaffEmail(data: {
  name: string;
  email: string;
  centre: string;
  role: string;
}): SendEmailInput {
  const subject = `Your centre register — ${data.centre}`;
  const html = render("centre-staff", `Hello ${data.name}`, {
    centre: data.centre,
    role: data.role,
    email: data.email,
    attendanceUrl: `${SITE_URL}/attendance`,
    eventDate: FELLOWS_EVENT_DATE,
    eventHours: FELLOWS_EVENT_HOURS,
  });
  return { to: [{ email: data.email, name: data.name }], subject, html };
}
