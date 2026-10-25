-- AlterTable
ALTER TABLE "public"."consultations" ADD COLUMN     "usual_weight_kg" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "public"."meal_plans" ADD COLUMN     "activity_detail" JSONB,
ADD COLUMN     "exercise_kcal" INTEGER,
ADD COLUMN     "physiological_kcal" INTEGER,
ADD COLUMN     "physiological_stage" TEXT,
ADD COLUMN     "stress_factor" DECIMAL(4,2);

