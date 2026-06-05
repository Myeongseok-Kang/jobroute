-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "benefits" TEXT,
ADD COLUMN     "detailFetched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mainTasks" TEXT,
ADD COLUMN     "preferredPoints" TEXT,
ADD COLUMN     "requirements" TEXT;
