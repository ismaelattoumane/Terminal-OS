/*
  Warnings:

  - A unique constraint covering the columns `[userId,idempotencyKey]` on the table `AutomationJob` will be added. If there are existing duplicate values, this will fail.
  - The required column `idempotencyKey` was added to the `AutomationJob` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "AutomationJob" ADD COLUMN     "idempotencyKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AutomationJob_userId_idempotencyKey_key" ON "AutomationJob"("userId", "idempotencyKey");
