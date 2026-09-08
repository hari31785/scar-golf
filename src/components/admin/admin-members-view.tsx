"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { AdminMemberRow } from "@/lib/admin/members-data";
import { MemberRow } from "@/components/admin/member-row";
import { AddMemberForm } from "@/components/admin/add-member-form";
import { useState } from "react";
import { InviteLinkDialog } from "@/components/admin/invite-link-dialog";
import type { InviteResult } from "@/components/admin/invite-result";

export function AdminMembersView({
  members,
}: {
  members: AdminMemberRow[];
}) {
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-emerald-900/10 bg-emerald-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white">
        <Link
          href="/admin"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          <ArrowLeft className="size-3.5" />
          Admin Control Center
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-900 text-emerald-300">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-emerald-300 uppercase">
              Admin
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pb-16 pt-5">
        <AddMemberForm />
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            onInviteCreated={setInviteResult}
          />
        ))}
      </main>

      <InviteLinkDialog
        invite={inviteResult}
        onOpenChange={(open: boolean) => {
          if (!open) setInviteResult(null);
        }}
      />
    </div>
  );
}
