-- Link subscription-covered bookings to the subscription that supplied their visit credit.
ALTER TABLE "Booking" ADD COLUMN "subscriptionId" TEXT;
CREATE INDEX "Booking_subscriptionId_scheduledStart_idx" ON "Booking"("subscriptionId", "scheduledStart");
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
