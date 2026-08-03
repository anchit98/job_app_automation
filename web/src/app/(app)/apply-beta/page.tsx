import { redirect } from "next/navigation";

/** Old Beta URL — Apply is now the main server-LLM flow. */
export default function ApplyBetaRedirectPage() {
  redirect("/apply");
}
