import Image from "next/image";

/**
 * Prominent photographic brand hero shown at the top of the Home page
 * main content. Reuses the same approved golf-course photograph already
 * used on the sign-in page (public/images/scar-golf-hero.png) — no new
 * image asset is introduced here. Only the approved identity copy
 * ("SCAR" / "Golf. Friends. Competition.") is rendered; no other
 * slogans or mock tournament content.
 */
export function GolfHeroBanner() {
  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl shadow-lg shadow-emerald-950/20 sm:h-64">
      <Image
        src="/images/scar-golf-hero.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 1200px, 100vw"
        className="object-cover object-[65%_center] sm:object-[center_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/70 via-emerald-950/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-4 pb-3 sm:px-5 sm:pb-4">
        <p
          className="text-6xl font-bold tracking-wide text-white sm:text-7xl"
          style={{ fontFamily: "var(--font-scar-display)" }}
        >
          SCAR
        </p>
        <p className="text-base font-medium text-emerald-100/90 italic sm:text-lg">
          Golf. Friends. Competition.
        </p>
      </div>
    </div>
  );
}
