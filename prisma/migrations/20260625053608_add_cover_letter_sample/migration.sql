-- CreateTable
CREATE TABLE "CoverLetterSample" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'jobkorea',
    "sourceUrl" TEXT,
    "company" TEXT,
    "jobCategory" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverLetterSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetterSample_contentHash_key" ON "CoverLetterSample"("contentHash");
