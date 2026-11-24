CREATE TYPE "QrPaymentSessionStatus" AS ENUM (
  'ACTIVE',
  'PAID',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "PaymentQrSession" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "providerQrCodeId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "shortUrl" TEXT NOT NULL,
  "status" "QrPaymentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentQrSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentQrSession_providerQrCodeId_key" ON "PaymentQrSession"("providerQrCodeId");
CREATE INDEX "PaymentQrSession_paymentId_status_createdAt_idx" ON "PaymentQrSession"("paymentId", "status", "createdAt");
CREATE INDEX "PaymentQrSession_status_expiresAt_idx" ON "PaymentQrSession"("status", "expiresAt");

ALTER TABLE "PaymentQrSession" ADD CONSTRAINT "PaymentQrSession_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
