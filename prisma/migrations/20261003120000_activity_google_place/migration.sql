-- AlterTable: the card's place on Google Maps (null when it isn't one specific place)
ALTER TABLE "Activity" ADD COLUMN "googlePlaceId" TEXT;
