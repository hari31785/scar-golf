ALTER TABLE "round_group_players" ADD COLUMN "skipped_round" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD COLUMN "skipped_round_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD COLUMN "skipped_round_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD CONSTRAINT "round_group_players_skipped_round_by_member_id_members_id_fk" FOREIGN KEY ("skipped_round_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;