-- AlterTable
ALTER TABLE "RedeemCode" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PREMIUM',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedBy" TEXT;

-- AlterTable
ALTER TABLE "RedeemCodeRedemption" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PREMIUM';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "accessRevokedAt" TIMESTAMP(3),
ADD COLUMN     "accessRevokedReason" TEXT,
ADD COLUMN     "affiliateGrantedAt" TIMESTAMP(3),
ADD COLUMN     "affiliateRevokedAt" TIMESTAMP(3),
ADD COLUMN     "coreActivatedAt" TIMESTAMP(3),
ADD COLUMN     "coreRevokedAt" TIMESTAMP(3),
ADD COLUMN     "ownerGrantedAt" TIMESTAMP(3),
ADD COLUMN     "ownerRevokedAt" TIMESTAMP(3),
ADD COLUMN     "premiumExpiresAt" TIMESTAMP(3),
ADD COLUMN     "premiumRevokedAt" TIMESTAMP(3),
ADD COLUMN     "premiumStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RedeemCode_kind_idx" ON "RedeemCode"("kind");
