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

      {/* Restrained, localized readability washes — not one heavy dark
          layer. A soft light wash sits behind the central branding
          column (which spans the brighter sky/course band), and only
          the lower band (grass) gets a subtle dark gradient so
          "More Than a Round" stays legible. */}
      <div className="absolute inset-0 bg-radial-[at_50%_30%] from-white/35 via-white/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-emerald-950/60 to-transparent" />

      <div className="relative flex min-h-full flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+2.25rem)] pb-8 sm:pt-16">
        <div className="w-full max-w-[640px]">
          <SignInFlow />
        </div>
      </div>
    </div>
  );
}
