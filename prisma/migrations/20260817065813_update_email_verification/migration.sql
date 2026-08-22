/*
  Warnings:

  - You are about to drop the column `verificationTokenExpiry` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "verificationTokenExpiry",
ADD COLUMN     "verificationTokenExpiresAt" TIMESTAMP(3);
