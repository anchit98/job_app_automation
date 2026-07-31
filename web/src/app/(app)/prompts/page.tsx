import { redirect } from "next/navigation";

/** Manual prompts inbox removed - AI steps run server-side via Apply. */
export default function PromptsPage() {
  redirect("/apply");
}
