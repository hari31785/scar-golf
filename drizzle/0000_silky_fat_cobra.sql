CREATE TYPE "public"."app_role" AS ENUM('PLAYER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."membership_type" AS ENUM('PERMANENT', 'ASSOCIATE');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"membership_type" "membership_type" NOT NULL,
	"app_role" "app_role" DEFAULT 'PLAYER' NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_unique_idx" ON "members" USING btree ("email");