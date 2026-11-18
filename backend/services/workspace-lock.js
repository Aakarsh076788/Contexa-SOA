// Every read-modify-write of workspace settings uses the same lock as ingestion
// and privacy changes. External provider requests must complete before entering.
export async function lockWorkspace(transaction, workspaceId) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
}
export function withWorkspaceLock(database, workspaceId, callback) {
  return database.$transaction(async transaction => {
    await lockWorkspace(transaction, workspaceId);
    return callback(transaction);
  });
}
