-- Match Prisma's declared cascading update behavior without changing records.
BEGIN;
ALTER TABLE "DeviceCredential" DROP CONSTRAINT "DeviceCredential_userId_fkey", ADD CONSTRAINT "DeviceCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceCredential" DROP CONSTRAINT "DeviceCredential_workspaceId_fkey", ADD CONSTRAINT "DeviceCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PairingCode" DROP CONSTRAINT "PairingCode_userId_fkey", ADD CONSTRAINT "PairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PairingCode" DROP CONSTRAINT "PairingCode_workspaceId_fkey", ADD CONSTRAINT "PairingCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" DROP CONSTRAINT "IngestionJob_workspaceId_fkey", ADD CONSTRAINT "IngestionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordRecovery" DROP CONSTRAINT "PasswordRecovery_userId_fkey", ADD CONSTRAINT "PasswordRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
