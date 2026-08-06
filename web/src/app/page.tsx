import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, userHasPaidAccess } from "@/lib/auth/user";
import { getSetupReadiness } from "@/lib/setup/readiness";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Keep homepage <title> and OG title exact — Google branding checks match this to OAuth.
  title: {
    absolute: "JobApp OS",
  },
  description:
    "JobApp OS is an AI-powered job application assistant that helps job seekers create tailored resumes and cover letters, organize job applications, and send personalized application emails via Gmail drafts. Learn why we request Google access in our Privacy Policy.",
  openGraph: {
    title: "JobApp OS",
    siteName: "JobApp OS",
  },
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
