CREATE TABLE "championship_round_holes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_round_id" uuid NOT NULL,
	"hole_number" integer NOT NULL,
	"par" integer NOT NULL,
	"stroke_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "championship_round_holes_hole_number_range_chk" CHECK ("championship_round_holes"."hole_number" >= 1 AND "championship_round_holes"."hole_number" <= 18),
	CONSTRAINT "championship_round_holes_stroke_index_range_chk" CHECK ("championship_round_holes"."stroke_index" >= 1 AND "championship_round_holes"."stroke_index" <= 18),
	CONSTRAINT "championship_round_holes_par_range_chk" CHECK ("championship_round_holes"."par" >= 3 AND "championship_round_holes"."par" <= 6)
);
--> statement-breakpoint
ALTER TABLE "championship_rounds" ADD COLUMN "tee_color" varchar(50);--> statement-breakpoint
ALTER TABLE "championship_round_holes" ADD CONSTRAINT "championship_round_holes_championship_round_id_championship_rounds_id_fk" FOREIGN KEY ("championship_round_id") REFERENCES "public"."championship_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "championship_round_holes_round_hole_unique_idx" ON "championship_round_holes" USING btree ("championship_round_id","hole_number");