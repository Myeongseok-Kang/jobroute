ALTER TABLE "Job" DROP COLUMN "embedding";
ALTER TABLE "Job" ADD COLUMN "embedding" vector(1024);