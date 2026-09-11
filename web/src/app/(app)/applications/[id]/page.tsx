import { notFound } from "next/navigation";
import { getApplication } from "@/app/actions/applications";
import { getContactsForApplication } from "@/app/actions/contacts";
import { getCoverLetterVersionsForApplication } from "@/app/actions/cover-letter";
import {
  getEmailSendPacks,
  getEmailsForApplication,
} from "@/app/actions/emails";
import { getFollowUpsForApplication } from "@/app/actions/follow-ups";
import { getDueFollowUpsByApplicationIds } from "@/lib/follow-ups/queries";
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
    contacts,
    emails,
    sendPacks,
    followUps,
    googleConnected,
    timelineEvents,
    pipelineSummaries,
    dueFollowUps,
  ] = await Promise.all([
    getApplication(id),
    getMasterResume().catch(() => null),
    getResumeVersionsForApplication(id).catch(() => []),
    getCoverLetterVersionsForApplication(id).catch(() => []),
    getContactsForApplication(id).catch(() => []),
    getEmailsForApplication(id).catch(() => []),
    getEmailSendPacks(id).catch(() => []),
    getFollowUpsForApplication(id).catch(() => []),
    getGoogleConnectedState().then((s) => s !== false),
    getApplicationTimeline(id).catch(() => []),
    getApplicationPipelineSummaries([id]).catch(
      () =>
        ({}) as Awaited<ReturnType<typeof getApplicationPipelineSummaries>>,
    ),
    getDueFollowUpsByApplicationIds([id]).catch(
      () =>
        ({}) as Awaited<ReturnType<typeof getDueFollowUpsByApplicationIds>>,
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
      contacts={contacts}
      emails={emails}
      sendPacks={sendPacks}
      followUps={followUps}
      dueFollowUp={dueFollowUps[id] ?? null}
      googleConnected={googleConnected}
      timelineEvents={timelineEvents}
      pipeline={pipelineSummaries[id] ?? null}
    />
  );
}
