CREATE TYPE "public"."container_movement_kind" AS ENUM('purchase', 'usage', 'count', 'writeoff');--> statement-breakpoint
CREATE TABLE "container_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"container_id" integer NOT NULL,
	"kind" "container_movement_kind" NOT NULL,
	"delta" integer NOT NULL,
	"sheet_id" integer,
	"expense_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_cup" boolean DEFAULT false NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"low_stock_level" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drink_sheet_container_counts" (
	"sheet_id" integer NOT NULL,
	"container_id" integer NOT NULL,
	"counted_used" integer NOT NULL,
	CONSTRAINT "drink_sheet_container_counts_sheet_id_container_id_pk" PRIMARY KEY("sheet_id","container_id")
);
--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD COLUMN "cup_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD COLUMN "container_id" integer;--> statement-breakpoint
ALTER TABLE "drinks" ADD COLUMN "container_id" integer;--> statement-breakpoint
ALTER TABLE "drinks" ADD COLUMN "allow_cup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_sheet_id_drink_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."drink_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_movements" ADD CONSTRAINT "container_movements_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheet_container_counts" ADD CONSTRAINT "drink_sheet_container_counts_sheet_id_drink_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."drink_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheet_container_counts" ADD CONSTRAINT "drink_sheet_container_counts_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "container_movements_container_idx" ON "container_movements" USING btree ("container_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "containers_name_uq" ON "containers" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD CONSTRAINT "drink_sheet_lines_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drinks" ADD CONSTRAINT "drinks_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD CONSTRAINT "drink_lines_cup_le_total" CHECK ("drink_sheet_lines"."cup_qty" >= 0 and "drink_sheet_lines"."cup_qty" <= "drink_sheet_lines"."sold_qty" + "drink_sheet_lines"."gift_qty");