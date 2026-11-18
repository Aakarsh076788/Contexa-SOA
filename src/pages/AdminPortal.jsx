import { useState, useEffect, useRef } from 'react';
import { requestApi, downloadJson } from '../lib/api.js';

export default function AdminPortal({ token, currentUser }) {
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionMsg, setActionMsg] = useState(null);

  // Modals
  const [pwModalUser, setPwModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [delModalUser, setDelModalUser] = useState(null);
  const [delLoading, setDelLoading] = useState(false);

  const loadData = async (tab = activeTab) => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'stats') {
        const res = await requestApi('/api/admin/stats', { token });
        setStats(res);
      } else if (tab === 'users') {
        const res = await requestApi('/api/admin/users', { token });
        setUsers(res);
      } else if (tab === 'connectors') {
        const res = await requestApi('/api/admin/connectors', { token });
        setConnectors(res);
      } else if (tab === 'health') {
        const res = await requestApi('/api/admin/health', { token });
        setHealth(res);
      }
    } catch (err) {
      setError(err.message || 'Failed to load admin telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const handleToggleRole = async (targetUser) => {
    const nextRole = targetUser.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Change role of ${targetUser.name} (${targetUser.email}) to ${nextRole.toUpperCase()}?`)) return;
    try {
      await requestApi(`/api/admin/users/${targetUser.id}/role`, {
        token,
        method: 'PUT',
        body: { role: nextRole }
      });
      setActionMsg({ type: 'success', text: `Role updated for ${targetUser.name} to ${nextRole}.` });
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, role: nextRole } : u));
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message || 'Failed to change user role.' });
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await requestApi(`/api/admin/users/${pwModalUser.id}/reset-password`, {
        token,
        method: 'POST',
        body: { password: newPassword }
      });
      setActionMsg({ type: 'success', text: `Password successfully updated for ${pwModalUser.name}. All active sessions terminated.` });
      setPwModalUser(null);
      setNewPassword('');
    } catch (err) {
      alert(err.message || 'Failed to reset password.');
    } finally {
      setPwLoading(false);
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleDeleteUser = async () => {
    if (!delModalUser) return;
    setDelLoading(true);
    try {
      await requestApi(`/api/admin/users/${delModalUser.id}`, {
        token,
        method: 'DELETE'
      });
      setActionMsg({ type: 'success', text: `User ${delModalUser.name} (${delModalUser.email}) and all their workspaces have been permanently purged.` });
      setUsers(prev => prev.filter(u => u.id !== delModalUser.id));
      setDelModalUser(null);
    } catch (err) {
      alert(err.message || 'Failed to delete user.');
    } finally {
      setDelLoading(false);
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const handleRebuildEngine = async () => {
    if (!window.confirm('Trigger context clustering engine rebuild across all workspaces?')) return;
    try {
      await requestApi('/api/context-engine/rebuild', { token, method: 'POST' });
      setActionMsg({ type: 'success', text: 'Context clustering engine rebuild complete.' });
    } catch (err) {
      setActionMsg({ type: 'error', text: err.message || 'Rebuild failed.' });
    }
    setTimeout(() => setActionMsg(null), 4000);
  };

  const filteredUsers = users.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredConnectors = connectors.filter(c =>
    (c.source || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.user?.name && c.user.name.toLowerCase().includes(search.toLowerCase())) ||
    (c.user?.email && c.user.email.toLowerCase().includes(search.toLowerCase()))
  );

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  };

  return (
    <div className="admin-portal">
      <div className="admin-privacy-banner">
        <span style={{ fontSize: '18px' }}>🛡️</span>
        <div>
          <strong>Privacy-Preserving Zero-Access Administration</strong>
          <div>Admin portal grants control over user accounts and system telemetry without exposing private user content (no browsing urls, context notes, event contents, or workspace memory).</div>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => { setActiveTab('stats'); setSearch(''); }}
        >
          <span>📊</span> Overview & Telemetry
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => { setActiveTab('users'); setSearch(''); }}
        >
          <span>👥</span> User Accounts ({users.length || '…'})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'connectors' ? 'active' : ''}`}
          onClick={() => { setActiveTab('connectors'); setSearch(''); }}
        >
          <span>🔌</span> Connectors Directory ({connectors.length || '…'})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => { setActiveTab('health'); setSearch(''); }}
        >
          <span>🩺</span> System Health
        </button>
      </div>

      {actionMsg && (
        <div className={`admin-alert ${actionMsg.type}`}>
          {actionMsg.text}
        </div>
      )}

      {error && (
        <div className="admin-alert error">
          {error}
        </div>
      )}

      {loading && <div className="loading-state">Loading administration telemetry…</div>}

      {!loading && activeTab === 'stats' && stats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Total Users</span>
                <span className="admin-stat-icon">👥</span>
              </div>
              <div className="admin-stat-value">{stats.totalUsers}</div>
              <div className="admin-stat-sub">{stats.activeUsers} active in last 7 days</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Workspaces</span>
                <span className="admin-stat-icon">🗂️</span>
              </div>
              <div className="admin-stat-value">{stats.totalWorkspaces}</div>
              <div className="admin-stat-sub">1 workspace per user</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Context Threads</span>
                <span className="admin-stat-icon">🧠</span>
              </div>
              <div className="admin-stat-value">{stats.totalContexts}</div>
              <div className="admin-stat-sub">Across all user workspaces</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Total Events</span>
                <span className="admin-stat-icon">⚡</span>
              </div>
              <div className="admin-stat-value">{stats.totalEvents}</div>
              <div className="admin-stat-sub">+{stats.eventsToday} events today</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Platform Entities</span>
                <span className="admin-stat-icon">📑</span>
              </div>
              <div className="admin-stat-value">{stats.totalEntities}</div>
              <div className="admin-stat-sub">Correlated signals</div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-header">
                <span>Connectors</span>
                <span className="admin-stat-icon">🔗</span>
              </div>
              <div className="admin-stat-value">{stats.totalConnectors}</div>
              <div className="admin-stat-sub">
                {Object.values(stats.connectedBySource || {}).reduce((a, b) => a + b, 0)} actively connected
              </div>
            </div>
          </div>

          <div className="admin-card">
            <h3 className="admin-section-title">
              <span>App Connectors Distribution</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>Connected vs Configured</span>
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '10px' }}>
              {Object.entries(stats.connectorsBySource || {}).map(([src, total]) => {
                const connectedCount = stats.connectedBySource?.[src] || 0;
                return (
                  <div key={src} style={{ padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textTransform: 'capitalize', fontWeight: 600, fontSize: '13px' }}>
                      <span>{src}</span>
                      <span className={`admin-role-badge ${connectedCount > 0 ? 'admin' : 'user'}`} style={{ fontSize: '9px' }}>
                        {connectedCount > 0 ? `${connectedCount} Connected` : 'Idle'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      {total} total instances
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'users' && (
        <div className="admin-card">
          <div className="admin-filter-bar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search users by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing {filteredUsers.length} of {users.length} registered users
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Registered</th>
                  <th>Workspace Footprint</th>
                  <th>Sessions</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isPrimaryAdmin = u.email === 'chimmaniaakarsh7@gmail.com';
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-user-avatar">
                            {u.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="admin-user-info">
                            <span className="admin-user-name">
                              {u.name} {isSelf && <span style={{ fontSize: '11px', color: '#818cf8' }}>(You)</span>}
                            </span>
                            <span className="admin-user-email">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-role-badge ${u.role === 'admin' ? 'admin' : 'user'}`}>
                          {u.role === 'admin' ? '★ Admin' : 'User'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '11.5px', color: '#94a3b8' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                          {u.workspace ? (
                            <>
                              <strong>{u.workspace.contextCount}</strong> contexts ·{' '}
                              <strong>{u.workspace.eventCount}</strong> events ·{' '}
                              <strong>{u.workspace.connectorCount}</strong> apps
                            </>
                          ) : (
                            <span style={{ color: '#64748b' }}>No workspace</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px' }}>
                          <span className={`admin-status-dot ${u.activeSessions > 0 ? 'active' : 'inactive'}`} />
                          {u.activeSessions} active
                        </span>
                      </td>
                      <td>
                        <div className="admin-actions-cell" style={{ justifyContent: 'flex-end' }}>
                          {!isPrimaryAdmin && (
                            <button
                              type="button"
                              className="admin-btn"
                              onClick={() => handleToggleRole(u)}
                              title={u.role === 'admin' ? 'Demote to regular user' : 'Promote to admin'}
                            >
                              {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="admin-btn primary"
                            onClick={() => { setPwModalUser(u); setNewPassword(''); }}
                            title="Reset password"
                          >
                            Reset Password
                          </button>
                          {!isPrimaryAdmin && !isSelf && (
                            <button
                              type="button"
                              className="admin-btn danger"
                              onClick={() => setDelModalUser(u)}
                              title="Delete account and purge all data"
                            >
                              Delete
                            </button>
                          )}
                          {isPrimaryAdmin && (
                            <span style={{ fontSize: '11px', color: '#c4b5fd', fontStyle: 'italic', padding: '0 4px' }}>
                              Primary Owner
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No users match "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'connectors' && (
        <div className="admin-card">
          <div className="admin-filter-bar">
            <input
              type="text"
              className="admin-search-input"
              placeholder="Search connectors by user or source…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing {filteredConnectors.length} of {connectors.length} connectors
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Account Owner</th>
                  <th>Transport</th>
                  <th>Status</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnectors.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize', color: '#f1f5f9' }}>
                        {c.source}
                      </span>
                    </td>
                    <td>
                      <div className="admin-user-info">
                        <span className="admin-user-name">{c.user?.name || 'Unknown User'}</span>
                        <span className="admin-user-email">{c.user?.email || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', color: '#94a3b8' }}>
                        {c.transport}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-role-badge ${c.connected ? 'admin' : 'user'}`} style={{ fontSize: '10px' }}>
                        <span className={`admin-status-dot ${c.connected ? 'active' : 'inactive'}`} />
                        {c.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '11.5px', color: '#94a3b8' }}>
                        {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : 'Never synced'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredConnectors.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No connectors match "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="admin-card">
            <h3 className="admin-section-title">
              <span>Platform Health & Diagnostics</span>
              <button
                type="button"
                className="admin-btn primary"
                onClick={() => loadData('health')}
              >
                Refresh Metrics
              </button>
            </h3>

            {health && (
              <div>
                <div className="admin-health-row">
                  <span className="admin-health-label">System Status</span>
                  <span className="admin-health-value" style={{ color: health.status === 'healthy' ? '#86efac' : '#fca5a5' }}>
                    ● {health.status.toUpperCase()}
                  </span>
                </div>
                <div className="admin-health-row">
                  <span className="admin-health-label">PostgreSQL Database</span>
                  <span className="admin-health-value">
                    {health.database?.connected ? `Connected (${health.database.latencyMs}ms latency)` : `Error: ${health.database?.error}`}
                  </span>
                </div>
                <div className="admin-health-row">
                  <span className="admin-health-label">Backend Uptime</span>
                  <span className="admin-health-value">{formatUptime(health.uptime)}</span>
                </div>
                <div className="admin-health-row">
                  <span className="admin-health-label">Node.js Engine</span>
                  <span className="admin-health-value">{health.nodeVersion}</span>
                </div>
                <div className="admin-health-row">
                  <span className="admin-health-label">Memory Allocation (Heap)</span>
                  <span className="admin-health-value">
                    {Math.round((health.memory?.heapUsed || 0) / 1024 / 1024)} MB / {Math.round((health.memory?.heapTotal || 0) / 1024 / 1024)} MB
                  </span>
                </div>
                <div className="admin-health-row">
                  <span className="admin-health-label">Last Ingested Signal</span>
                  <span className="admin-health-value">
                    {health.lastActivity ? new Date(health.lastActivity).toLocaleString() : 'No signals yet'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="admin-card">
            <h3 className="admin-section-title">Platform Maintenance Operations</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 14px 0' }}>
              Trigger maintenance tasks across the Contexa engine. Re-indexing will run clustering algorithms over recent activity across all user workspaces.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="admin-btn primary"
                onClick={handleRebuildEngine}
              >
                Trigger Context Engine Re-indexing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {pwModalUser && (
        <div className="admin-modal-backdrop" onClick={() => setPwModalUser(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset User Password</h3>
            <p>
              Set a new password for <strong>{pwModalUser.name}</strong> ({pwModalUser.email}).
              This will automatically revoke all existing sessions for this user.
            </p>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px', color: '#cbd5e1' }}>
                New Password (minimum 8 characters)
                <input
                  type="password"
                  className="admin-search-input"
                  style={{ maxWidth: '100%', width: '100%' }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  required
                  minLength={8}
                  autoFocus
                />
              </label>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => setPwModalUser(null)}
                  disabled={pwLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn primary"
                  disabled={pwLoading}
                >
                  {pwLoading ? 'Updating…' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {delModalUser && (
        <div className="admin-modal-backdrop" onClick={() => setDelModalUser(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#fca5a5' }}>Confirm User Deletion</h3>
            <p>
              Are you sure you want to permanently delete <strong>{delModalUser.name}</strong> ({delModalUser.email})?
            </p>
            <p style={{ color: '#ef4444', fontSize: '12px' }}>
              ⚠️ This will delete their workspace, contexts, events, entities, sessions, and all connected data. This action cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => setDelModalUser(null)}
                disabled={delLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn danger"
                onClick={handleDeleteUser}
                disabled={delLoading}
              >
                {delLoading ? 'Deleting…' : 'Permanently Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
