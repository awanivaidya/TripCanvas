-- AlterTable: what the traveler eats (one sentence from the chat; null on older trips)
ALTER TABLE "Trip" ADD COLUMN "dietary" TEXT;
