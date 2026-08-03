import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobApp OS | Job application automation",
  description:
    "JobApp OS is a job application automation web app. It helps job seekers create tailored resumes and cover letters, store materials in Google Drive and Google Docs, prepare Gmail drafts for outreach, and track applications — without sending email on the user's behalf.",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    if (!userHasPaidAccess(user)) {
      redirect("/billing");
    }
    const readiness = await getSetupReadiness().catch(() => null);
    redirect(readiness?.setupReady ? "/dashboard" : "/onboarding");
  }

  return <LandingPage />;
}
