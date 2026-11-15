CREATE UNIQUE INDEX "Payment_one_active_subscription_payment_key"
ON "Payment" ("subscriptionId")
WHERE "subscriptionId" IS NOT NULL AND "status" IN ('PENDING', 'AUTHORIZED');
