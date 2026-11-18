-- CreateTable
CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "trialGrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialClaim_emailHash_key" ON "TrialClaim"("emailHash");

-- CreateIndex
CREATE INDEX "TrialClaim_trialGrantedAt_idx" ON "TrialClaim"("trialGrantedAt");
