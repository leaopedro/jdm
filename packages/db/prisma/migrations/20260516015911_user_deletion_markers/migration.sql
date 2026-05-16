-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'deleted';
ALTER TYPE "UserStatus" ADD VALUE 'anonymized';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "anonymizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
