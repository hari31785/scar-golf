import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Playfair_Display } from "next/font/google";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { getCurrentMember } from "@/lib/current-member";

const displaySerif = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scar-display",
});

export const metadata: Metadata = {
  title: "Sign In · SCAR Championship",
};

export default async function SignInPage() {
  const current = await getCurrentMember();
  if (current) {
    redirect("/");
  }

  return (
    <div
      className={`${displaySerif.variable} relative min-h-full flex-1 overflow-hidden bg-emerald-950`}
    >
      {/* Clean, text-free golf-course photograph — the sole photographic
          canvas for the page. On narrow phones, shift the focal point
          toward center so the sunset/course stays visible even if the
          ball/flag get slightly cropped; desktop shows the full scene. */}
      <Image
        src="/images/scar-golf-hero.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[65%_center] sm:object-[center_center]"
      />

      {/* Cinematic, localized contrast vignette — NOT a flat dark
          overlay. The bright sky/upper-branding band stays essentially
          untouched; a subtle darkening gradually builds through the
          course/auth band so the light auth text stays readable, and
          strengthens slightly at the very bottom for the tagline. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-35% via-emerald-950/25 via-70% to-emerald-950/60" />

      <div className="relative flex min-h-full flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+2.25rem)] pb-8 sm:pt-16">
        <div className="w-full max-w-[640px]">
          <SignInFlow />
        </div>
      </div>
    </div>
  );
}
