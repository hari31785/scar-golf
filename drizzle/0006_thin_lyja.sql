CREATE TYPE "public"."championship_status" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('ACTIVE', 'WITHDRAWN', 'DISQUALIFIED');--> statement-breakpoint
CREATE TYPE "public"."championship_round_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."round_group_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."pairing_generation_type" AS ENUM('INITIAL', 'NET_STANDINGS', 'MANUAL_OVERRIDE');--> statement-breakpoint
CREATE TABLE "championships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "championship_status" DEFAULT 'DRAFT' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"champion_member_id" uuid,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "championship_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"frozen_handicap" integer,
	"membership_type_snapshot" "membership_type",
	"participant_status" "participant_status" DEFAULT 'ACTIVE' NOT NULL,
	"final_position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "championship_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"played_date" timestamp with time zone,
	"status" "championship_round_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"course_name" varchar(200),
	"course_city" varchar(200),
	"tee_name" varchar(100),
	"course_rating" numeric(4, 1),
	"slope" integer,
	"par" integer,
	"yardage" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "championship_rounds_round_number_range_chk" CHECK ("championship_rounds"."round_number" >= 1 AND "championship_rounds"."round_number" <= 4)
);
--> statement-breakpoint
CREATE TABLE "round_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"group_number" integer NOT NULL,
	"tee_time" timestamp with time zone,
	"status" "round_group_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_group_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_group_id" uuid NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"championship_player_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"generation_type" "pairing_generation_type" NOT NULL,
	"generated_by_member_id" uuid,
	"standings_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "championships" ADD CONSTRAINT "championships_champion_member_id_members_id_fk" FOREIGN KEY ("champion_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championships" ADD CONSTRAINT "championships_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_players" ADD CONSTRAINT "championship_players_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_players" ADD CONSTRAINT "championship_players_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_rounds" ADD CONSTRAINT "championship_rounds_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_groups" ADD CONSTRAINT "round_groups_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_groups" ADD CONSTRAINT "round_groups_submitted_by_member_id_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD CONSTRAINT "round_group_players_round_group_id_round_groups_id_fk" FOREIGN KEY ("round_group_id") REFERENCES "public"."round_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD CONSTRAINT "round_group_players_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_group_players" ADD CONSTRAINT "round_group_players_championship_player_id_championship_players_id_fk" FOREIGN KEY ("championship_player_id") REFERENCES "public"."championship_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_generations" ADD CONSTRAINT "pairing_generations_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_generations" ADD CONSTRAINT "pairing_generations_generated_by_member_id_members_id_fk" FOREIGN KEY ("generated_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "championships_year_idx" ON "championships" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "championship_players_championship_member_unique_idx" ON "championship_players" USING btree ("championship_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "championship_rounds_championship_round_number_unique_idx" ON "championship_rounds" USING btree ("championship_id","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "round_groups_round_group_number_unique_idx" ON "round_groups" USING btree ("championship_round_id","group_number");--> statement-breakpoint
CREATE UNIQUE INDEX "round_group_players_round_player_unique_idx" ON "round_group_players" USING btree ("championship_round_id","championship_player_id");