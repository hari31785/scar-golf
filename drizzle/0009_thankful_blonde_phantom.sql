CREATE TYPE "public"."playoff_session_status" AS ENUM('IN_PROGRESS', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "playoff_hole_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playoff_hole_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"gross_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playoff_holes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playoff_session_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playoff_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playoff_session_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playoff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_id" uuid NOT NULL,
	"status" "playoff_session_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"winner_championship_player_id" uuid,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playoff_hole_scores" ADD CONSTRAINT "playoff_hole_scores_playoff_hole_id_playoff_holes_id_fk" FOREIGN KEY ("playoff_hole_id") REFERENCES "public"."playoff_holes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_hole_scores" ADD CONSTRAINT "playoff_hole_scores_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_holes" ADD CONSTRAINT "playoff_holes_playoff_session_id_playoff_sessions_id_fk" FOREIGN KEY ("playoff_session_id") REFERENCES "public"."playoff_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_holes" ADD CONSTRAINT "playoff_holes_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_participants" ADD CONSTRAINT "playoff_participants_playoff_session_id_playoff_sessions_id_fk" FOREIGN KEY ("playoff_session_id") REFERENCES "public"."playoff_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_participants" ADD CONSTRAINT "playoff_participants_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_sessions" ADD CONSTRAINT "playoff_sessions_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_sessions" ADD CONSTRAINT "playoff_sessions_winner_championship_player_id_championship_players_id_fk" FOREIGN KEY ("winner_championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playoff_sessions" ADD CONSTRAINT "playoff_sessions_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_hole_scores_hole_player_unique_idx" ON "playoff_hole_scores" USING btree ("playoff_hole_id","championship_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_holes_session_sequence_unique_idx" ON "playoff_holes" USING btree ("playoff_session_id","sequence_number");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_participants_session_player_unique_idx" ON "playoff_participants" USING btree ("playoff_session_id","championship_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playoff_sessions_championship_unique_idx" ON "playoff_sessions" USING btree ("championship_id");