/**
 * Normalizes an email address for comparison/storage: trims surrounding
 * whitespace and lowercases it. Always use this before querying or storing
 * emails so allowlist checks are case/whitespace insensitive.
 *
 * Deliberately has no server-only restriction and no DB import, so it can
 * be safely used from standalone scripts (e.g. src/db/seed/members.ts) as
 * well as server-only application code.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
