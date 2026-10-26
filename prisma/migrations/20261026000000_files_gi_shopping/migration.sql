-- CreateEnum
CREATE TYPE "public"."FileKind" AS ENUM ('FOOD_IMAGE', 'PATIENT_FILE');

-- AlterTable
ALTER TABLE "public"."foods" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "glycemic_index" INTEGER,
ADD COLUMN     "image_id" UUID;

-- AlterTable
ALTER TABLE "public"."meal_plans" ADD COLUMN     "shopping_extras" JSONB;

-- CreateTable
CREATE TABLE "public"."stored_files" (
    "id" UUID NOT NULL,
    "kind" "public"."FileKind" NOT NULL,
    "owner_id" UUID,
    "patient_id" UUID,
    "lab_result_id" UUID,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_files_patient_id_created_at_idx" ON "public"."stored_files"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "foods_image_id_key" ON "public"."foods"("image_id");

-- AddForeignKey
ALTER TABLE "public"."foods" ADD CONSTRAINT "foods_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stored_files" ADD CONSTRAINT "stored_files_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stored_files" ADD CONSTRAINT "stored_files_lab_result_id_fkey" FOREIGN KEY ("lab_result_id") REFERENCES "public"."lab_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

