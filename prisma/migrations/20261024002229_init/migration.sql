-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('NUTRITIONIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."Sex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "public"."AppointmentType" AS ENUM ('FIRST_VISIT', 'CONTROL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "public"."AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "public"."ConsultationType" AS ENUM ('INITIAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "public"."CalorieMethod" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "public"."EnergyEquation" AS ENUM ('MIFFLIN_ST_JEOR', 'HARRIS_BENEDICT', 'FAO_WHO', 'OWEN', 'KATCH_MCARDLE', 'KCAL_PER_KG');

-- CreateEnum
CREATE TYPE "public"."ExchangeMode" AS ENUM ('TRADITIONAL', 'PANAMA', 'COMBINED');

-- CreateEnum
CREATE TYPE "public"."FoodSource" AS ENUM ('TRADITIONAL', 'PANAMA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."MealPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'NUTRITIONIST',
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "full_name" TEXT NOT NULL,
    "license_number" TEXT,
    "phone" TEXT,
    "clinic_name" TEXT,
    "clinic_address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'PA',
    "timezone" TEXT NOT NULL DEFAULT 'America/Panama',
    "default_equation" "public"."EnergyEquation" NOT NULL DEFAULT 'MIFFLIN_ST_JEOR',
    "default_exchange_mode" "public"."ExchangeMode" NOT NULL DEFAULT 'PANAMA',
    "default_cho_pct" INTEGER NOT NULL DEFAULT 50,
    "default_pro_pct" INTEGER NOT NULL DEFAULT 20,
    "default_fat_pct" INTEGER NOT NULL DEFAULT 30,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_name" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "max_patients" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "current_period_end" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."support_tickets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'OPEN',
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."patients" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "sex" "public"."Sex" NOT NULL,
    "birth_date" DATE NOT NULL,
    "document_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "occupation" TEXT,
    "address" TEXT,
    "reason" TEXT,
    "goal" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."patient_backgrounds" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "pathological" TEXT,
    "family" TEXT,
    "surgical" TEXT,
    "allergies" TEXT,
    "intolerances" TEXT,
    "gastrointestinal" TEXT,
    "gynecological" TEXT,
    "smoking" TEXT,
    "alcohol" TEXT,
    "physical_activity" TEXT,
    "sleep" TEXT,
    "stress" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."diet_histories" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "meals_per_day" INTEGER,
    "recall_24h" TEXT,
    "food_frequency" TEXT,
    "preferences" TEXT,
    "aversions" TEXT,
    "water_intake" TEXT,
    "appetite" TEXT,
    "eats_outside" TEXT,
    "who_cooks" TEXT,
    "supplements" TEXT,
    "previous_diets" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diet_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lab_results" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "taken_on" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."medications" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "frequency" TEXT,
    "is_supplement" BOOLEAN NOT NULL DEFAULT false,
    "started_on" DATE,
    "ended_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."appointments" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 45,
    "type" "public"."AppointmentType" NOT NULL DEFAULT 'CONTROL',
    "status" "public"."AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."consultations" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "type" "public"."ConsultationType" NOT NULL DEFAULT 'INITIAL',
    "date" DATE NOT NULL,
    "reason" TEXT,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,1),
    "waist_cm" DECIMAL(5,1),
    "hip_cm" DECIMAL(5,1),
    "arm_cm" DECIMAL(4,1),
    "calf_cm" DECIMAL(4,1),
    "neck_cm" DECIMAL(4,1),
    "body_fat_pct" DECIMAL(4,1),
    "muscle_mass_kg" DECIMAL(5,2),
    "visceral_fat" DECIMAL(4,1),
    "extra_measures" JSONB,
    "systolic_bp" INTEGER,
    "diastolic_bp" INTEGER,
    "clinical_findings" TEXT,
    "diagnosis" TEXT,
    "symptoms" TEXT,
    "adherence_pct" INTEGER,
    "treatment_changes" TEXT,
    "notes" TEXT,
    "next_steps" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exchange_systems" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exchange_groups" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kcal" DECIMAL(6,1) NOT NULL,
    "cho_g" DECIMAL(5,1) NOT NULL,
    "pro_g" DECIMAL(5,1) NOT NULL,
    "fat_g" DECIMAL(5,1) NOT NULL,
    "portion_hint" TEXT,
    "color" TEXT NOT NULL DEFAULT '#4f8a5b',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exchange_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."foods" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID,
    "code" TEXT,
    "group_id" UUID,
    "source" "public"."FoodSource" NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "portion_text" TEXT NOT NULL,
    "portion_grams" DECIMAL(6,1),
    "kcal" DECIMAL(6,1) NOT NULL,
    "cho_g" DECIMAL(5,1) NOT NULL,
    "pro_g" DECIMAL(5,1) NOT NULL,
    "fat_g" DECIMAL(5,1) NOT NULL,
    "fiber_g" DECIMAL(5,1),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recipes" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recipe_ingredients" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "servings" DECIMAL(5,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meal_plans" (
    "id" UUID NOT NULL,
    "nutritionist_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "consultation_id" UUID,
    "title" TEXT NOT NULL,
    "status" "public"."MealPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "calorie_method" "public"."CalorieMethod" NOT NULL DEFAULT 'AUTOMATIC',
    "equation" "public"."EnergyEquation",
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,1),
    "age_years" INTEGER,
    "sex" "public"."Sex",
    "body_fat_pct" DECIMAL(4,1),
    "kcal_per_kg" DECIMAL(4,1),
    "activity_factor" DECIMAL(4,3),
    "resting_kcal" INTEGER,
    "total_kcal" INTEGER,
    "adjustment_pct" INTEGER,
    "adjustment_kcal" INTEGER,
    "target_kcal" INTEGER NOT NULL,
    "cho_pct" INTEGER NOT NULL,
    "pro_pct" INTEGER NOT NULL,
    "fat_pct" INTEGER NOT NULL,
    "exchange_mode" "public"."ExchangeMode" NOT NULL,
    "system_id" UUID NOT NULL,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" TEXT,
    "notes" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meal_plan_exchanges" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "group_key" TEXT NOT NULL,
    "servings" DECIMAL(4,1) NOT NULL,

    CONSTRAINT "meal_plan_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meal_plan_meals" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "exchanges" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,

    CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."meal_plan_items" (
    "id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "food_id" UUID,
    "recipe_id" UUID,
    "custom_name" TEXT,
    "servings" DECIMAL(5,2) NOT NULL,
    "substitute_of_id" UUID,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meal_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "public"."sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "public"."sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "public"."subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "public"."subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "public"."support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "patients_nutritionist_id_archived_at_idx" ON "public"."patients"("nutritionist_id", "archived_at");

-- CreateIndex
CREATE INDEX "patients_nutritionist_id_last_name_idx" ON "public"."patients"("nutritionist_id", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "patient_backgrounds_patient_id_key" ON "public"."patient_backgrounds"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "diet_histories_patient_id_key" ON "public"."diet_histories"("patient_id");

-- CreateIndex
CREATE INDEX "lab_results_patient_id_taken_on_idx" ON "public"."lab_results"("patient_id", "taken_on");

-- CreateIndex
CREATE INDEX "medications_patient_id_idx" ON "public"."medications"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_nutritionist_id_starts_at_idx" ON "public"."appointments"("nutritionist_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_appointment_id_key" ON "public"."consultations"("appointment_id");

-- CreateIndex
CREATE INDEX "consultations_patient_id_date_idx" ON "public"."consultations"("patient_id", "date");

-- CreateIndex
CREATE INDEX "consultations_nutritionist_id_date_idx" ON "public"."consultations"("nutritionist_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_systems_code_key" ON "public"."exchange_systems"("code");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_groups_system_id_key_key" ON "public"."exchange_groups"("system_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "foods_code_key" ON "public"."foods"("code");

-- CreateIndex
CREATE INDEX "foods_nutritionist_id_idx" ON "public"."foods"("nutritionist_id");

-- CreateIndex
CREATE INDEX "foods_group_id_idx" ON "public"."foods"("group_id");

-- CreateIndex
CREATE INDEX "recipes_nutritionist_id_idx" ON "public"."recipes"("nutritionist_id");

-- CreateIndex
CREATE INDEX "meal_plans_patient_id_created_at_idx" ON "public"."meal_plans"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "meal_plans_nutritionist_id_status_idx" ON "public"."meal_plans"("nutritionist_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_exchanges_plan_id_group_key_key" ON "public"."meal_plan_exchanges"("plan_id", "group_key");

-- CreateIndex
CREATE INDEX "meal_plan_meals_plan_id_idx" ON "public"."meal_plan_meals"("plan_id");

-- CreateIndex
CREATE INDEX "meal_plan_items_meal_id_idx" ON "public"."meal_plan_items"("meal_id");

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patients" ADD CONSTRAINT "patients_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patient_backgrounds" ADD CONSTRAINT "patient_backgrounds_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."diet_histories" ADD CONSTRAINT "diet_histories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."lab_results" ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."medications" ADD CONSTRAINT "medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consultations" ADD CONSTRAINT "consultations_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."consultations" ADD CONSTRAINT "consultations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exchange_groups" ADD CONSTRAINT "exchange_groups_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "public"."exchange_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."foods" ADD CONSTRAINT "foods_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."foods" ADD CONSTRAINT "foods_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recipes" ADD CONSTRAINT "recipes_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plans" ADD CONSTRAINT "meal_plans_nutritionist_id_fkey" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plans" ADD CONSTRAINT "meal_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plans" ADD CONSTRAINT "meal_plans_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_exchanges" ADD CONSTRAINT "meal_plan_exchanges_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_items" ADD CONSTRAINT "meal_plan_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_items" ADD CONSTRAINT "meal_plan_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_items" ADD CONSTRAINT "meal_plan_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."meal_plan_items" ADD CONSTRAINT "meal_plan_items_substitute_of_id_fkey" FOREIGN KEY ("substitute_of_id") REFERENCES "public"."meal_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
