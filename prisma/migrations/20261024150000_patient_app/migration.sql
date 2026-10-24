-- CreateEnum
CREATE TYPE "public"."FoodLogSource" AS ENUM ('PHOTO', 'MANUAL');

-- AlterEnum
ALTER TYPE "public"."UserRole" ADD VALUE 'PATIENT';

-- AlterTable
ALTER TABLE "public"."patients" ADD COLUMN     "invite_code" TEXT,
ADD COLUMN     "invite_expires_at" TIMESTAMP(3),
ADD COLUMN     "user_id" UUID;

-- CreateTable
CREATE TABLE "public"."food_logs" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal_name" TEXT,
    "description" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "kcal" INTEGER NOT NULL,
    "cho_g" DECIMAL(6,1) NOT NULL,
    "pro_g" DECIMAL(6,1) NOT NULL,
    "fat_g" DECIMAL(6,1) NOT NULL,
    "source" "public"."FoodLogSource" NOT NULL DEFAULT 'MANUAL',
    "confidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."food_scans" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "is_food" BOOLEAN NOT NULL,
    "kcal" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."weight_logs" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_logs_patient_id_date_idx" ON "public"."food_logs"("patient_id", "date");

-- CreateIndex
CREATE INDEX "food_scans_patient_id_created_at_idx" ON "public"."food_scans"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "weight_logs_patient_id_date_key" ON "public"."weight_logs"("patient_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "public"."patients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_invite_code_key" ON "public"."patients"("invite_code");

-- AddForeignKey
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."food_logs" ADD CONSTRAINT "food_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."food_scans" ADD CONSTRAINT "food_scans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."weight_logs" ADD CONSTRAINT "weight_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

