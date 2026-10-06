-- Written by hand instead of generated: Prisma would DROP "travelers" and ADD "adults", which
-- deletes every trip's traveler count. RENAME keeps the data (old trips' travelers become adults).
ALTER TABLE "Trip" RENAME COLUMN "travelers" TO "adults";

-- New: children, and the preferred ways to travel ("flight", "train", "road"; empty = no preference).
ALTER TABLE "Trip" ADD COLUMN "children" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "transportModes" TEXT[] DEFAULT ARRAY[]::TEXT[];
