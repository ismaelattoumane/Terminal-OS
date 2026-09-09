/*
  Warnings:

  - You are about to drop the column `subjectName` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `teacher` on the `Schedule` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Schedule" DROP COLUMN "subjectName",
DROP COLUMN "teacher";
