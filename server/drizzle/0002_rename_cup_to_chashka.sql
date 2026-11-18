-- The cup container is called "Chashka". Rename the one created as "Stakan" (keeps any custom name).
UPDATE "containers" SET "name" = 'Chashka' WHERE "is_cup" = true AND "name" = 'Stakan' AND NOT EXISTS (SELECT 1 FROM "containers" WHERE lower("name") = 'chashka');
