-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AppointmentStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "public"."AppointmentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "public"."appointments" ADD COLUMN     "requested_by_patient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "response_note" TEXT;

-- AlterTable
ALTER TABLE "public"."patients" ADD COLUMN     "created_from_app" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "link_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_link_code_key" ON "public"."users"("link_code");

