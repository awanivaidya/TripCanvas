-- AlterTable: map coordinates of the card's Google place (kept at most 30 days, per Google's rules)
ALTER TABLE "Activity" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Activity" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Activity" ADD COLUMN "locatedAt" TIMESTAMP(3);
