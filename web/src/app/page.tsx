import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobApp OS | Job application automation",
  description:
    "JobApp OS helps job seekers automate applications: tailored resumes and cover letters stored in Google Drive and Google Docs, Gmail drafts for outreach (you send), and application tracking. Learn why we request Google access in our Privacy Policy.",
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
