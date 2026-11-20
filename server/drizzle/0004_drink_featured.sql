ALTER TABLE "drinks" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Group names from the printed bar menu (only groups still named as originally seeded are renamed).
UPDATE "drinks" SET "group_name" = 'Issiq kofe' WHERE "group_name" = 'Issiq ichimliklar';--> statement-breakpoint
UPDATE "drinks" SET "group_name" = 'Anchan va matcha' WHERE "group_name" = 'Ays maxsus';--> statement-breakpoint
UPDATE "drinks" SET "group_name" = 'Milksheyk' WHERE "group_name" = 'Kokteyllar';--> statement-breakpoint
UPDATE "drinks" SET "group_name" = 'Mualliflik choyi' WHERE "group_name" = 'Choylar';--> statement-breakpoint
UPDATE "drinks" SET "group_name" = 'Muzdek ichimliklar' WHERE "group_name" = 'Limonadlar';--> statement-breakpoint
UPDATE "drinks" SET "featured" = true WHERE "name" IN ('Raf xolva', 'Ays anchan qulupnayli');
