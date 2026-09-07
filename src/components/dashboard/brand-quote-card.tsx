/**
 * Closing brand-moment quote card shown near the bottom of the Home
 * page, echoing the reference design. Purely decorative/static text —
 * no data dependency.
 */
export function BrandQuoteCard() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted/60 px-5 py-6 text-center ring-1 ring-foreground/10">
      <p
        className="text-sm leading-relaxed text-foreground/80 italic sm:text-base"
        style={{ fontFamily: "var(--font-scar-display)" }}
      >
        &ldquo;A great day of golf, with great friends, is what SCAR is all
        about.&rdquo;
      </p>
      <span className="mt-1 h-px w-10 bg-foreground/20" />
    </div>
  );
}
