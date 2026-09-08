"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { getAuthenticatorName } from "@better-auth/passkey";

export type PasskeySummary = {
  id: string;
  name: string | null;
  aaguid: string | null;
  createdAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown date";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Safe, non-invented display label: prefers the platform-reported
 * authenticator name (from Better Auth's best-effort AAGUID map), then
 * any name the WebAuthn ceremony supplied, then a generic fallback. */
function displayLabel(passkey: PasskeySummary): string {
  return (
    getAuthenticatorName(passkey.aaguid ?? undefined) ??
    passkey.name ??
    "Passkey"
  );
}

/**
 * Member-facing Passkeys management section (Account/Security).
 *
 * Adding/revoking passkeys always operates on the CURRENT authenticated
 * Better Auth user/session — Better Auth's passkey plugin natively
 * supports multiple passkey rows per user (see src/db/schema/auth.ts),
 * so this never creates a new member or a new auth user. Revocation
 * uses the plugin's own ownership-enforced delete endpoint (a member
 * can only ever delete their own passkeys — enforced server-side by
 * the plugin itself, not reimplemented here).
 */
export function PasskeyManager({
  initialPasskeys,
}: {
  initialPasskeys: PasskeySummary[];
}) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [isAdding, setIsAdding] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await authClient.passkey.listUserPasskeys();
    if (data) {
      setPasskeys(
        data.map((p) => ({
          id: p.id,
          name: p.name ?? null,
          aaguid: p.aaguid ?? null,
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        }))
      );
    }
  }

  async function handleAddPasskey() {
    setError(null);
    setIsAdding(true);
    try {
      const { error } = await authClient.passkey.addPasskey();
      if (error) {
        setError(error.message ?? "Couldn't add a passkey. Please try again.");
        return;
      }
      await refresh();
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const { error } = await authClient.passkey.deletePasskey({ id });
    setPendingDeleteId(null);
    if (error) {
      setError(error.message ?? "Couldn't remove that passkey. Please try again.");
      return;
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <KeyRound className="size-5 text-emerald-800" />
          Passkeys
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use multiple passkeys to access SCAR from your devices.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {passkeys.length === 0 ? (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            No passkeys registered yet.
          </p>
        ) : (
          passkeys.map((passkey) => (
            <div
              key={passkey.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayLabel(passkey)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Added {formatDate(passkey.createdAt)}
                </p>
              </div>

              {pendingDeleteId === passkey.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(passkey.id)}
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDeleteId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${displayLabel(passkey)}`}
                  onClick={() => setPendingDeleteId(passkey.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {pendingDeleteId && passkeys.length === 1 ? (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          This is your only passkey. Removing it may prevent you from
          signing in unless an admin issues a new enrollment link.
        </p>
      ) : null}

      <Button
        type="button"
        onClick={handleAddPasskey}
        disabled={isAdding}
        className="h-12 w-full justify-center gap-2 rounded-xl bg-emerald-900 text-sm font-bold text-emerald-50 hover:bg-emerald-800"
      >
        <Plus className="size-4" />
        {isAdding ? "Waiting for device…" : "Add another passkey"}
      </Button>
    </div>
  );
}
