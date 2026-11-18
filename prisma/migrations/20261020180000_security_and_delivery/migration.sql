-- Additive migration: existing accounts, sessions, and connector tokens remain valid.
CREATE TABLE "DeviceCredential" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
 "source" TEXT NOT NULL, "label" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 CONSTRAINT "DeviceCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceCredential_tokenHash_key" ON "DeviceCredential"("tokenHash");
CREATE INDEX "DeviceCredential_workspaceId_createdAt_idx" ON "DeviceCredential"("workspaceId", "createdAt");
CREATE TABLE "PairingCode" (
 "code" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "source" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "pairedAt" TIMESTAMP(3), CONSTRAINT "PairingCode_pkey" PRIMARY KEY ("code")
);
CREATE INDEX "PairingCode_expiresAt_idx" ON "PairingCode"("expiresAt");
CREATE TABLE "IngestionJob" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "leaseToken" TEXT,
 "result" JSONB, "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IngestionJob_workspaceId_fingerprint_key" ON "IngestionJob"("workspaceId", "fingerprint");
CREATE INDEX "IngestionJob_status_availableAt_idx" ON "IngestionJob"("status", "availableAt");
CREATE INDEX "IngestionJob_workspaceId_createdAt_idx" ON "IngestionJob"("workspaceId", "createdAt");
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "DeviceCredential" ADD CONSTRAINT "DeviceCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PairingCode" ADD CONSTRAINT "PairingCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
