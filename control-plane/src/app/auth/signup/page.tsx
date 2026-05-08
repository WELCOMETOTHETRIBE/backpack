import { redirect } from "next/navigation";

export default function LegacySignUpRedirect() {
  redirect("/sign-up");
}
