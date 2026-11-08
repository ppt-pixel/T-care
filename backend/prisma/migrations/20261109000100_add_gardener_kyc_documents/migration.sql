-- Persist Gardener identity documents and their Admin review history.
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TABLE "GardenerKycDocument" (
    "id" TEXT NOT NULL,
    "gardenerId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GardenerKycDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GardenerKycDocument_mediaAssetId_key" ON "GardenerKycDocument"("mediaAssetId");
CREATE INDEX "GardenerKycDocument_gardenerId_status_createdAt_idx" ON "GardenerKycDocument"("gardenerId", "status", "createdAt");
CREATE INDEX "GardenerKycDocument_status_createdAt_idx" ON "GardenerKycDocument"("status", "createdAt");

ALTER TABLE "GardenerKycDocument" ADD CONSTRAINT "GardenerKycDocument_gardenerId_fkey" FOREIGN KEY ("gardenerId") REFERENCES "GardenerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GardenerKycDocument" ADD CONSTRAINT "GardenerKycDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
