import { redirect } from "next/navigation";

/** The cinematic experience is the homepage now — keep old links working. */
export default function ExperienceRedirect() {
  redirect("/");
}
