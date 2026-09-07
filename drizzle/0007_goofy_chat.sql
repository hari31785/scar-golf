CREATE TABLE "hole_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"round_group_id" uuid NOT NULL,
	"hole_number" integer NOT NULL,
	"gross_score" integer NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hole_scores_hole_number_range_chk" CHECK ("hole_scores"."hole_number" >= 1 AND "hole_scores"."hole_number" <= 18),
	CONSTRAINT "hole_scores_gross_score_range_chk" CHECK ("hole_scores"."gross_score" >= 1 AND "hole_scores"."gross_score" <= 20)
);
--> statement-breakpoint
CREATE TABLE "scorecard_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"round_group_id" uuid NOT NULL,
	"submitted_by_member_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gross_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"hole_number" integer NOT NULL,
	"hole_score_id" uuid NOT NULL,
	"original_gross_score" integer NOT NULL,
	"new_gross_score" integer NOT NULL,
	"changed_by_member_id" uuid NOT NULL,
	"reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hole_scores" ADD CONSTRAINT "hole_scores_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hole_scores" ADD CONSTRAINT "hole_scores_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hole_scores" ADD CONSTRAINT "hole_scores_round_group_id_round_groups_id_fk" FOREIGN KEY ("round_group_id") REFERENCES "public"."round_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hole_scores" ADD CONSTRAINT "hole_scores_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_round_group_id_round_groups_id_fk" FOREIGN KEY ("round_group_id") REFERENCES "public"."round_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_submissions" ADD CONSTRAINT "scorecard_submissions_submitted_by_member_id_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_audit_log" ADD CONSTRAINT "score_audit_log_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_audit_log" ADD CONSTRAINT "score_audit_log_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_audit_log" ADD CONSTRAINT "score_audit_log_hole_score_id_hole_scores_id_fk" FOREIGN KEY ("hole_score_id") REFERENCES "public"."hole_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_audit_log" ADD CONSTRAINT "score_audit_log_changed_by_member_id_members_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hole_scores_round_player_hole_unique_idx" ON "hole_scores" USING btree ("championship_round_id","championship_player_id","hole_number");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_submissions_round_player_unique_idx" ON "scorecard_submissions" USING btree ("championship_round_id","championship_player_id");