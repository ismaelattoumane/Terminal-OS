-- CreateEnum
CREATE TYPE "CalendarExceptionType" AS ENUM ('holiday', 'vacation', 'no_class', 'exceptional');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "contentHash" TEXT;

-- CreateTable
CREATE TABLE "CalendarException" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "CalendarExceptionType" NOT NULL,
    "label" TEXT,

    CONSTRAINT "CalendarException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarException_userId_date_idx" ON "CalendarException"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarException_userId_date_key" ON "CalendarException"("userId", "date");

-- AddForeignKey
ALTER TABLE "CalendarException" ADD CONSTRAINT "CalendarException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
