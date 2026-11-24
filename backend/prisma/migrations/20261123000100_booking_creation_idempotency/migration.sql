-- Persist customer booking request keys so retried submissions cannot create duplicates.
ALTER TABLE "Booking"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyFingerprint" TEXT;

CREATE UNIQUE INDEX "Booking_idempotencyKey_key"
  ON "Booking"("idempotencyKey");
