import { redirect } from "next/navigation";

/** Manual new-application form removed - auto-apply only. */
export default function NewApplicationPage() {
  redirect("/apply");
}
