export async function connectorDiagnostics(db, workspaceId) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, include: { connectors: true } });
  const settings = workspace?.settings || {};
  return Promise.all((workspace?.connectors || []).map(async connector => {
    const last = await db.event.findFirst({ where: { workspaceId, source: connector.source, kind: { not: 'DIAGNOSTIC' } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    const configured = Boolean(settings[connector.source]?.configuredAt || settings[connector.source]?.connectedAt || settings[connector.source]?.token || last || connector.connected);
    return { source: connector.source, configured, enabled: settings.tracking !== false && settings.apps?.[connector.source] === true && connector.connected, lastCaptureAt: last?.createdAt || null, lastError: !last || new Date(settings.diagnostics?.[connector.source]?.at || 0) > new Date(last.createdAt) ? settings.diagnostics?.[connector.source]?.error || null : null, lastErrorAt: settings.diagnostics?.[connector.source]?.at || null, scopes: connector.scopes, status: !configured ? 'setup_required' : !connector.connected || settings.tracking === false || !settings.apps?.[connector.source] ? 'paused' : !last ? 'awaiting_activity' : Date.now() - new Date(last.createdAt) > 86400000 ? 'no_recent_activity' : 'receiving' };
  }));
}
export async function recordDeliveryError(db, workspaceId, source, error) {
  if (!['chrome', 'vscode', 'discord', 'telegram', 'github'].includes(source)) return;
  try {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      const settings = workspace?.settings || {};
      await tx.workspace.update({ where: { id: workspaceId }, data: { settings: { ...settings, diagnostics: { ...settings.diagnostics, [source]: { at: new Date().toISOString(), error: error.status === 400 ? 'Invalid activity payload.' : 'Activity delivery failed. Retry and check the server connection.' } } } } });
    });
  } catch { /* Diagnostics must never mask the original request failure. */ }
}
