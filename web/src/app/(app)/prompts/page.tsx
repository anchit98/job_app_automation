import { redirect } from "next/navigation";

/** Manual prompts inbox removed - ChatGPT steps run via JobApp Bridge. */
export default function PromptsPage() {
  redirect("/apply");
}
