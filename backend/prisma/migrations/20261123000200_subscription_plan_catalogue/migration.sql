-- Structured T-CARE plan catalogue and UPI AutoPay lifecycle fields.
CREATE TYPE "SubscriptionPlanType" AS ENUM (
  'ONE_TIME_SERVICE',
  'WEEKLY',
  'ONE_MONTH',
  'ONE_YEAR',
  'LEGACY_RECURRING'
);

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "planType" "SubscriptionPlanType" NOT NULL DEFAULT 'LEGACY_RECURRING',
  ADD COLUMN "serviceFrequency" TEXT,
  ADD COLUMN "benefits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "razorpayPlanId" TEXT;

-- Existing plans remain LEGACY_RECURRING. A free-text billingCycle does not prove
-- that the customer authorised a Razorpay UPI AutoPay mandate. Admin must create
-- new structured plan definitions or explicitly migrate unused plans after review.

CREATE UNIQUE INDEX "SubscriptionPlan_razorpayPlanId_key"
  ON "SubscriptionPlan"("razorpayPlanId");
CREATE INDEX "SubscriptionPlan_status_planType_price_idx"
  ON "SubscriptionPlan"("status", "planType", "price");

CREATE TABLE "SubscriptionPlanService" (
  "planId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  CONSTRAINT "SubscriptionPlanService_pkey" PRIMARY KEY ("planId", "serviceId")
);
CREATE INDEX "SubscriptionPlanService_serviceId_idx"
  ON "SubscriptionPlanService"("serviceId");
ALTER TABLE "SubscriptionPlanService"
  ADD CONSTRAINT "SubscriptionPlanService_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanService"
  ADD CONSTRAINT "SubscriptionPlanService_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "providerSubscriptionId" TEXT;
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key"
  ON "Subscription"("providerSubscriptionId");
