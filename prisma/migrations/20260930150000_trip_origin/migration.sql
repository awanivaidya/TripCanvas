-- The traveler's starting point, confirmed in the chat (null for trips made before this).
ALTER TABLE "Trip" ADD COLUMN "origin" TEXT;
