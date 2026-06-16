-- Restore NOT NULL on display_name with a fallback for any rows missing one
UPDATE "users" SET "display_name" = COALESCE("display_name", split_part("email", '@', 1), 'New User');
ALTER TABLE "users" ALTER COLUMN "display_name" SET DEFAULT 'New User';
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;
