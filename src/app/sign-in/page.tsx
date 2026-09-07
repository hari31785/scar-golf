import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { getCurrentMember } from "@/lib/current-member";

export const metadata: Metadata = {
  title: "Sign In · SCAR Championship",
};

export default async function SignInPage() {
  const current = await getCurrentMember();
  if (current) {
    redirect("/");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/30 px-6 py-16">
      <SignInFlow />
    </div>
  );
}
