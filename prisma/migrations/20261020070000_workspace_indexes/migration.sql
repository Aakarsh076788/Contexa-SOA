CREATE INDEX IF NOT EXISTS "Context_workspaceId_updatedAt_idx" ON "Context"("workspaceId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Event_workspaceId_createdAt_idx" ON "Event"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_workspaceId_contextId_idx" ON "Event"("workspaceId", "contextId");
CREATE INDEX IF NOT EXISTS "Entity_workspaceId_contextId_idx" ON "Entity"("workspaceId", "contextId");
CREATE INDEX IF NOT EXISTS "Relationship_contextId_idx" ON "Relationship"("contextId");
CREATE INDEX IF NOT EXISTS "Version_contextId_number_idx" ON "Version"("contextId", "number");
CREATE INDEX IF NOT EXISTS "Branch_contextId_idx" ON "Branch"("contextId");
