-- AlterTable: when a transport leg arrives, in local time (null for other cards)
ALTER TABLE "Activity" ADD COLUMN "arrivalTime" TEXT;
