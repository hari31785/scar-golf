CREATE TYPE "public"."round_source" AS ENUM('HISTORICAL_IMPORT', 'CHAMPIONSHIP');--> statement-breakpoint
CREATE TABLE "played_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"played_at" date NOT NULL,
	"course_name" varchar(200) NOT NULL,
	"course_city" varchar(200),
	"gross_score" integer NOT NULL,
	"course_rating" numeric(4, 1) NOT NULL,
	"slope" integer NOT NULL,
	"par" integer,
	"source" "round_source" DEFAULT 'HISTORICAL_IMPORT' NOT NULL,
	"imported_at" timestamp with time zone,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"max_handicap" integer DEFAULT 18 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "played_rounds" ADD CONSTRAINT "played_rounds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "played_rounds_member_id_idx" ON "played_rounds" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "played_rounds_member_played_at_idx" ON "played_rounds" USING btree ("member_id","played_at");