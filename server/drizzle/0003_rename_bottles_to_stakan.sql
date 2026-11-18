-- Bottles are called "stakan": "Kraft butilka" → "Kraft stakan", "Shaffof butilka" → "Shaffof stakan".
UPDATE "containers" SET "name" = 'Kraft stakan' WHERE "name" = 'Kraft butilka' AND NOT EXISTS (SELECT 1 FROM "containers" WHERE lower("name") = 'kraft stakan');--> statement-breakpoint
UPDATE "containers" SET "name" = 'Shaffof stakan' WHERE "name" = 'Shaffof butilka' AND NOT EXISTS (SELECT 1 FROM "containers" WHERE lower("name") = 'shaffof stakan');
