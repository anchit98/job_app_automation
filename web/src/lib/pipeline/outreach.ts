/**
 * Everything the Cold Email panel needs for one application.
 *
 * The pipeline screen used to end on an "All done" card that only told the
 * user their run had finished and pointed at another page. What they actually
 * want at that moment is to send the emails, so the pipeline shows the same
 * panel the Outreach tab does — and it needs the same three things.
 */
import { getEmailSendPacks, getEmailsForApplication } from "@/app/actions/emails";
import { getContactsForApplication } from "@/app/actions/contacts";
import {
  getLatestReadyCoverLetterVersion,
  getLatestReadyResumeVersion,
} from "@/lib/db/queries";
import type { Contact, EmailRecord } from "@/lib/db/types";
import type { EmailSendPack } from "@/lib/emails/manual-send";

export interface PipelineOutreach {
  emails: EmailRecord[];
  contacts: Contact[];
  send_packs: EmailSendPack[];
  /** Files the user attaches by hand — a compose URL cannot carry them. */
  attachments: Array<{ label: string; href: string }>;
}

export async function loadPipelineOutreach(
  applicationId: string,
): Promise<PipelineOutreach> {
  const [emails, contacts, sendPacks, resume, coverLetter] = await Promise.all([
    getEmailsForApplication(applicationId).catch(() => []),
    getContactsForApplication(applicationId).catch(() => []),
    getEmailSendPacks(applicationId).catch(() => []),
    getLatestReadyResumeVersion(applicationId).catch(() => null),
    getLatestReadyCoverLetterVersion(applicationId).catch(() => null),
  ]);

  const attachments: PipelineOutreach["attachments"] = [];
  if (resume) {
    attachments.push({
      label: `Resume v${resume.version} (PDF)`,
      href: `/api/applications/${applicationId}/resume/${resume.version}/pdf`,
    });
  }
  if (coverLetter) {
    attachments.push({
      label: `Cover letter v${coverLetter.version} (PDF)`,
      href: `/api/applications/${applicationId}/cover-letter/${coverLetter.version}/pdf`,
    });
  }

  return { emails, contacts, send_packs: sendPacks, attachments };
}
