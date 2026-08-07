import { notFound } from "next/navigation";
import { getApplication } from "@/app/actions/applications";
import { getContactsForApplication } from "@/app/actions/contacts";
import {
  getCoverLetterVersionsForApplication,
  getMasterCoverLetter,
} from "@/app/actions/cover-letter";
import { getEmailsForApplication } from "@/app/actions/emails";
import { getFollowUpsForApplication } from "@/app/actions/follow-ups";
import { getResumeVersionsForApplication } from "@/app/actions/resume";
import { getMasterResume } from "@/app/actions/master-resume";
import { getApplicationTimeline } from "@/app/actions/tracker";
import { getApplicationPipelineSummaries } from "@/app/actions/pipeline";
import { ApplicationWorkspace } from "@/components/applications/application-workspace";
import { getGoogleConnectedState } from "@/lib/google/tokens";
import { resumeContentSchema } from "@/lib/resume/fabrication";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    application,
    masterResumeRow,
    resumeVersions,
    coverLetterVersions,
    masterCoverLetter,
    contacts,
    emails,
    followUps,
    googleConnected,
    timelineEvents,
    pipelineSummaries,
  ] = await Promise.all([
    getApplication(id),
    getMasterResume().catch(() => null),
    getResumeVersionsForApplication(id).catch(() => []),
    getCoverLetterVersionsForApplication(id).catch(() => []),
    getMasterCoverLetter().catch(() => null),
    getContactsForApplication(id).catch(() => []),
    getEmailsForApplication(id).catch(() => []),
    getFollowUpsForApplication(id).catch(() => []),
    getGoogleConnectedState().then((s) => s !== false),
    getApplicationTimeline(id).catch(() => []),
    getApplicationPipelineSummaries([id]).catch(
      () =>
        ({}) as Awaited<ReturnType<typeof getApplicationPipelineSummaries>>,
    ),
  ]);
  if (!application) notFound();

  const masterParsed = masterResumeRow?.content
    ? resumeContentSchema.safeParse(masterResumeRow.content)
    : null;
  const masterResume = masterParsed?.success ? masterParsed.data : null;

  return (
    <ApplicationWorkspace
      application={application}
      masterResume={masterResume}
      resumeVersions={resumeVersions}
      coverLetterVersions={coverLetterVersions}
      coverLetterTemplateReady={Boolean(
        masterCoverLetter?.doc_id && masterCoverLetter?.doc_layout,
      )}
      contacts={contacts}
      emails={emails}
      followUps={followUps}
      googleConnected={googleConnected}
      timelineEvents={timelineEvents}
      pipeline={pipelineSummaries[id] ?? null}
    />
  );
}
