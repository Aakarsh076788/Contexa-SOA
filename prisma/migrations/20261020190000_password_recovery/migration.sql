CREATE TABLE "PasswordRecovery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "PasswordRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "PasswordRecovery_userId_createdAt_idx" ON "PasswordRecovery"("userId", "createdAt");
CREATE INDEX "PasswordRecovery_expiresAt_idx" ON "PasswordRecovery"("expiresAt");
