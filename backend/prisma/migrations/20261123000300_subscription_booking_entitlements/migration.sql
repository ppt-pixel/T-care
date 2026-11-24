-- Admin-managed visit quotas, renewal-cycle bounds, and period-scoped credits.
ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "includedVisitsPerPeriod" INTEGER,
  ADD COLUMN "minimumVisitIntervalDays" INTEGER,
  ADD COLUMN "maxRenewalCycles" INTEGER;

ALTER TABLE "Subscription"
  ADD COLUMN "providerSubscriptionStatus" TEXT,
  ADD COLUMN "providerSubscriptionCreateState" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "mandateAuthorizedAt" TIMESTAMP(3),
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Subscription_idempotencyKey_key"
  ON "Subscription"("idempotencyKey");

ALTER TABLE "Booking"
  ADD COLUMN "subscriptionPlanId" TEXT,
  ADD COLUMN "subscriptionVisitCreditId" TEXT,
  ADD COLUMN "creditRestoredAt" TIMESTAMP(3);
CREATE INDEX "Booking_subscriptionPlanId_idx" ON "Booking"("subscriptionPlanId");
CREATE INDEX "Booking_subscriptionVisitCreditId_idx" ON "Booking"("subscriptionVisitCreditId");
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_subscriptionPlanId_fkey"
  FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SubscriptionVisitCredit" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "visitsGranted" INTEGER NOT NULL,
  "visitsUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionVisitCredit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionVisitCredit_positive_quota_check" CHECK ("visitsGranted" > 0),
  CONSTRAINT "SubscriptionVisitCredit_used_range_check" CHECK ("visitsUsed" >= 0 AND "visitsUsed" <= "visitsGranted"),
  CONSTRAINT "SubscriptionVisitCredit_period_check" CHECK ("periodEnd" > "periodStart")
);
CREATE UNIQUE INDEX "SubscriptionVisitCredit_subscriptionId_periodStart_key"
  ON "SubscriptionVisitCredit"("subscriptionId", "periodStart");
CREATE INDEX "SubscriptionVisitCredit_subscriptionId_periodEnd_idx"
  ON "SubscriptionVisitCredit"("subscriptionId", "periodEnd");
ALTER TABLE "SubscriptionVisitCredit"
  ADD CONSTRAINT "SubscriptionVisitCredit_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_subscriptionVisitCreditId_fkey"
  FOREIGN KEY ("subscriptionVisitCreditId") REFERENCES "SubscriptionVisitCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
