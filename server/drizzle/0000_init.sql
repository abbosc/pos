CREATE TYPE "public"."cash_movement_kind" AS ENUM('withdrawal', 'deposit');--> statement-breakpoint
CREATE TYPE "public"."movement_kind" AS ENUM('opening', 'purchase', 'refill', 'sale', 'writeoff', 'correction');--> statement-breakpoint
CREATE TABLE "cash_closes" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected" integer NOT NULL,
	"counted" integer NOT NULL,
	"is_opening" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "cash_movement_kind" NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"cash_close_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_pos" CHECK ("cash_movements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "drink_sheet_lines" (
	"sheet_id" integer NOT NULL,
	"drink_id" integer NOT NULL,
	"sold_qty" integer DEFAULT 0 NOT NULL,
	"gift_qty" integer DEFAULT 0 NOT NULL,
	"unit_price" integer NOT NULL,
	"unit_cost" integer,
	CONSTRAINT "drink_sheet_lines_sheet_id_drink_id_pk" PRIMARY KEY("sheet_id","drink_id"),
	CONSTRAINT "drink_lines_qty_nonneg" CHECK ("drink_sheet_lines"."sold_qty" >= 0 and "drink_sheet_lines"."gift_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "drink_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"cash_close_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drink_sheets_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "drinks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"cost_per_cup" integer,
	"image_path" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"paid_from_cash" boolean DEFAULT true NOT NULL,
	"note" text,
	"purchase_id" integer,
	"cash_close_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_pos" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sell_price" integer NOT NULL,
	"avg_cost" integer DEFAULT 0 NOT NULL,
	"warehouse_qty" integer DEFAULT 0 NOT NULL,
	"stand_qty" integer DEFAULT 0 NOT NULL,
	"low_stock_level" integer DEFAULT 0 NOT NULL,
	"image_path" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_qty_nonneg" CHECK ("products"."warehouse_qty" >= 0 and "products"."stand_qty" >= 0),
	CONSTRAINT "products_prices_nonneg" CHECK ("products"."sell_price" >= 0 and "products"."avg_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total" integer NOT NULL,
	"paid_from_cash" boolean NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stand_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"kind" "movement_kind" NOT NULL,
	"warehouse_delta" integer DEFAULT 0 NOT NULL,
	"stand_delta" integer DEFAULT 0 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"purchase_id" integer,
	"stand_count_id" integer,
	"cash_close_id" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_close_id_cash_closes_id_fk" FOREIGN KEY ("cash_close_id") REFERENCES "public"."cash_closes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD CONSTRAINT "drink_sheet_lines_sheet_id_drink_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."drink_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheet_lines" ADD CONSTRAINT "drink_sheet_lines_drink_id_drinks_id_fk" FOREIGN KEY ("drink_id") REFERENCES "public"."drinks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drink_sheets" ADD CONSTRAINT "drink_sheets_cash_close_id_cash_closes_id_fk" FOREIGN KEY ("cash_close_id") REFERENCES "public"."cash_closes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_close_id_cash_closes_id_fk" FOREIGN KEY ("cash_close_id") REFERENCES "public"."cash_closes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stand_count_id_stand_counts_id_fk" FOREIGN KEY ("stand_count_id") REFERENCES "public"."stand_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cash_close_id_cash_closes_id_fk" FOREIGN KEY ("cash_close_id") REFERENCES "public"."cash_closes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drinks_name_uq" ON "drinks" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_uq" ON "products" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_created_idx" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_open_sales_idx" ON "stock_movements" USING btree ("kind") WHERE "stock_movements"."cash_close_id" is null;