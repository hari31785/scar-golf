"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMemberAction } from "@/lib/admin/members-actions";

/**
 * Minimal Admin "Add Member" form. Creates only the SCAR member record
 * — no Better Auth user, passkey, or invite. Email is required because
 * `members.email` is an existing NOT NULL/unique column (the enrollment
 * allowlist anchor); this is a pre-existing schema constraint, not a
 * new requirement. The member's real authentication is set up later via
 * the existing Create Invite enrollment flow.
 */
export function AddMemberForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [membershipType, setMembershipType] = useState<"PERMANENT" | "ASSOCIATE">(
    "PERMANENT"
  );
  const [appRole, setAppRole] = useState<"PLAYER" | "ADMIN">("PLAYER");

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setMembershipType("PERMANENT");
    setAppRole("PLAYER");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await addMemberAction({
        firstName,
        lastName,
        email,
        membershipType,
        appRole,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        onClick={() => setIsOpen(true)}
        className="h-11 w-full justify-center gap-2 rounded-xl bg-emerald-900 text-sm font-semibold text-emerald-50 hover:bg-emerald-800"
      >
        <Plus className="size-4" />
        Add Member
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <p className="text-sm font-semibold text-foreground">Add Member</p>

      <div className="flex gap-2">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          required
          className="h-10 w-1/2 rounded-lg border border-border bg-background px-3 text-sm"
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          required
          className="h-10 w-1/2 rounded-lg border border-border bg-background px-3 text-sm"
        />
      </div>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        type="email"
        required
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
      />

      <div className="flex gap-2">
        <select
          value={membershipType}
          onChange={(e) =>
            setMembershipType(e.target.value as "PERMANENT" | "ASSOCIATE")
          }
          className="h-10 w-1/2 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="PERMANENT">Permanent</option>
          <option value="ASSOCIATE">Associate</option>
        </select>
        <select
          value={appRole}
          onChange={(e) => setAppRole(e.target.value as "PLAYER" | "ADMIN")}
          className="h-10 w-1/2 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="PLAYER">Player</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 rounded-lg text-sm"
          onClick={() => {
            reset();
            setIsOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="h-10 flex-1 rounded-lg bg-emerald-900 text-sm font-semibold text-emerald-50 hover:bg-emerald-800"
        >
          {isSaving ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
