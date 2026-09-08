import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCurrentMember } from "@/lib/current-member";
import { getInitials } from "@/lib/members";
import { AppHeader } from "@/components/dashboard/app-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { PasskeyManager } from "@/components/auth/passkey-manager";

export default async function AccountPage() {
  const current = await getCurrentMember();
  if (!current) {
    redirect("/sign-in");
  }
  const { member } = current;

  // Initial server-rendered list — the client component re-fetches via
  // authClient.passkey.listUserPasskeys() after any add/revoke so the UI
  // never shows stale data, but this avoids a loading flash on first paint.
  // Reuses the existing Better Auth passkey plugin's own endpoint; no new
  // storage or query logic.
  const passkeys = await auth.api.listPasskeys({ headers: await headers() });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <AppHeader
        greetingName={member.firstName}
        initials={getInitials(member.firstName, member.lastName)}
        isAdmin={member.appRole === "ADMIN"}
      />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-28 pt-5">
        <PasskeyManager
          initialPasskeys={passkeys.map((p) => ({
            id: p.id,
            name: p.name ?? null,
            aaguid: p.aaguid ?? null,
            createdAt: p.createdAt ? p.createdAt.toISOString() : null,
          }))}
        />
      </main>

      <BottomNav />
    </div>
  );
}
