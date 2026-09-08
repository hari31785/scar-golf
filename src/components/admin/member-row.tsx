"use client";

import { useState } from "react";
import { KeyRound, Loader2, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminMemberRow } from "@/lib/admin/members-data";
import { createInviteAction, revokeInviteAction } from "@/lib/admin/actions";
import {
  updateMembershipTypeAction,
  updateAppRoleAction,
  setMemberStatusAction,
  updateEmailAction,
} from "@/lib/admin/members-actions";
import type { InviteResult } from "@/components/admin/invite-result";

function membershipLabel(type: AdminMemberRow["membershipType"]) {
  return type === "PERMANENT" ? "Permanent" : "Associate";
}

function passkeyStatusLabel(count: number) {
  if (count === 0) return "Not enrolled";
  if (count === 1) return "Passkey enrolled";
  return `${count} passkeys`;
}

function formatExpiry(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "expired";
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "expires soon";
  return `expires in ${hours}h`;
}

export function MemberRow({
  member,
  onInviteCreated,
}: {
  member: AdminMemberRow;
  onInviteCreated: (invite: InviteResult) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isSavingType, setIsSavingType] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(member.email);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = member.status === "ACTIVE";

  async function handleToggleMembershipType() {
    setError(null);
    setIsSavingType(true);
    try {
      const next = member.membershipType === "PERMANENT" ? "ASSOCIATE" : "PERMANENT";
      const result = await updateMembershipTypeAction({
        memberId: member.id,
        membershipType: next,
      });
      if (!result.ok) setError(result.error);
    } finally {
      setIsSavingType(false);
    }
  }

  async function handleToggleAppRole() {
    setError(null);
    setIsSavingRole(true);
    try {
      const next = member.appRole === "ADMIN" ? "PLAYER" : "ADMIN";
      const result = await updateAppRoleAction({ memberId: member.id, appRole: next });
      if (!result.ok) setError(result.error);
    } finally {
      setIsSavingRole(false);
    }
  }

  async function handleToggleStatus() {
    setError(null);
    setIsSavingStatus(true);
    try {
      const next = isActive ? "INACTIVE" : "ACTIVE";
      const result = await setMemberStatusAction({ memberId: member.id, status: next });
      if (!result.ok) setError(result.error);
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleSaveEmail() {
    setError(null);
    setIsSavingEmail(true);
    try {
      const result = await updateEmailAction({ memberId: member.id, email: emailValue });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditingEmail(false);
    } finally {
      setIsSavingEmail(false);
    }
  }

  async function handleCreateInvite() {
    setError(null);
    setIsCreating(true);
    try {
      const result = await createInviteAction(member.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onInviteCreated({
        url: result.url,
        expiresAt: result.expiresAt,
        memberDisplayName: result.memberDisplayName,
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevokeInvite() {
    if (!member.outstandingInvite) return;
    setError(null);
    setIsRevoking(true);
    try {
      const result = await revokeInviteAction(member.outstandingInvite.id);
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
            {member.displayName}
            {member.isOwner ? (
              <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Owner" />
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{membershipLabel(member.membershipType)}</Badge>
            <Badge variant={member.appRole === "ADMIN" ? "default" : "secondary"}>
              {member.appRole === "ADMIN" ? "Admin" : "Player"}
            </Badge>
            <Badge variant={isActive ? "secondary" : "destructive"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" />
            {passkeyStatusLabel(member.passkeyCount)}
          </p>

          {isEditingEmail ? (
            <div className="mt-2 flex items-center gap-1.5">
              <Input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                className="h-8 text-xs"
                disabled={isSavingEmail}
              />
              <Button
                type="button"
                size="sm"
                disabled={isSavingEmail}
                onClick={handleSaveEmail}
                className="h-8 shrink-0 rounded-lg px-2 text-xs"
              >
                {isSavingEmail ? "…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSavingEmail}
                onClick={() => {
                  setEmailValue(member.email);
                  setIsEditingEmail(false);
                }}
                className="h-8 shrink-0 rounded-lg px-2 text-xs"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingEmail(true)}
              className="mt-2 truncate text-left text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              {member.email}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSavingType}
          onClick={handleToggleMembershipType}
          className="h-8 rounded-lg px-3 text-xs"
        >
          {isSavingType
            ? "…"
            : `Make ${member.membershipType === "PERMANENT" ? "Associate" : "Permanent"}`}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSavingRole || member.isOwner}
          onClick={handleToggleAppRole}
          title={member.isOwner ? "The owner must remain an Admin." : undefined}
          className="h-8 rounded-lg px-3 text-xs"
        >
          {isSavingRole ? "…" : `Make ${member.appRole === "ADMIN" ? "Player" : "Admin"}`}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSavingStatus || member.isOwner}
          onClick={handleToggleStatus}
          title={member.isOwner ? "The owner cannot be deactivated." : undefined}
          className="h-8 rounded-lg px-3 text-xs text-destructive hover:bg-destructive/10"
        >
          {isSavingStatus ? "…" : isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {member.outstandingInvite ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Invite pending — {formatExpiry(member.outstandingInvite.expiresAt)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isRevoking}
              onClick={handleRevokeInvite}
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              {isRevoking ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        ) : null}

        <Button
          type="button"
          disabled={!isActive || isCreating}
          onClick={handleCreateInvite}
          className="h-11 w-full rounded-xl bg-emerald-900 text-sm font-semibold text-emerald-50 hover:bg-emerald-800 disabled:bg-muted disabled:text-muted-foreground"
        >
          {isCreating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : member.outstandingInvite ? (
            "Regenerate Invite"
          ) : (
            "Create Invite"
          )}
        </Button>
        {!isActive ? (
          <p className="text-center text-xs text-muted-foreground">
            Inactive members can&apos;t receive enrollment invites.
          </p>
        ) : null}
      </div>
    </div>
  );
}
