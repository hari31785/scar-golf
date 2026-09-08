import Image from "next/image";

/**
 * Shared compact hero used at the top of secondary pages (Leaderboard,
 * Members, History, Handicaps, Score, Rules, FAQ, How To, Account &
 * Security, and Admin pages) to establish the same premium visual
 * language as the Home page hero. Reuses the same approved photograph
 * as Home/sign-in (public/images/scar-golf-hero.png) — no new image
 * asset. Renders only the real page title; no invented copy or
 * rejected branding strings.
 */
export function PageHero({ title }: { title: string }) {
  return (
    <div className="relative mb-4 h-24 w-full shrink-0 overflow-hidden rounded-2xl shadow-lg shadow-emerald-950/20 sm:h-28">
      <Image
        src="/images/scar-golf-hero.png"
        alt=""
        fill
        sizes="(min-width: 1024px) 1200px, 100vw"
        className="object-cover object-[65%_center] sm:object-[center_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-950/25 to-transparent" />
      <div className="absolute inset-0 flex items-end px-4 pb-3 sm:px-5 sm:pb-3.5">
        <h1
          className="text-2xl font-bold text-white sm:text-3xl"
          style={{ fontFamily: "var(--font-scar-display)" }}
        >
          {title}
        </h1>
      </div>
    </div>
  );
}
