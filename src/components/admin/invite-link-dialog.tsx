"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { InviteResult } from "@/components/admin/invite-result";

function formatExpiryLocal(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InviteLinkDialog({
  invite,
  onOpenChange,
}: {
  invite: InviteResult | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context, etc.) — the
      // link is still selectable/visible in the dialog either way.
    }
  }

  return (
    <Dialog
      open={invite !== null}
      onOpenChange={(open) => {
        if (!open) setCopied(false);
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-900 text-emerald-300">
            <KeyRound className="size-5" />
          </div>
          <DialogTitle>
            Invite ready for {invite?.memberDisplayName ?? ""}
          </DialogTitle>
          <DialogDescription>
            {invite
              ? `Expires ${formatExpiryLocal(invite.expiresAt)}. Copy this link and text it to the member — it will only be shown once.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {invite ? (
          <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
            <p className="break-all font-mono text-xs text-foreground">
              {invite.url}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleCopy}
            className="h-11 w-full rounded-xl bg-emerald-900 text-sm font-semibold text-emerald-50 hover:bg-emerald-800 sm:w-auto"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copy Link
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
