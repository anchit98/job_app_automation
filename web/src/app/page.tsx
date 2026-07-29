import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/user";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobApp OS | Applications customized for you",
  description:
    "JobApp OS is your personalized job application AI agent. Tailored resumes, cover letters, Gmail drafts, and follow-ups with AI in the loop.",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
